# Videos con IA: trabajos de generación de video tutoriales y su publicación en el manual.
# Solo se registra con VIDEO_IA_HABILITADO=true (main.py). Todos los endpoints requieren rol 2.
"""
Flujo sin trabajo largo dentro de una petición HTTP:

1. POST /videos-ia crea el trabajo en "pendiente". Solo valida límites, estima
   el costo y guarda. No llama a ningún servicio externo.
2. El panel llama a POST /videos-ia/{id}/avanzar cada pocos segundos. Cada
   llamada ejecuta UN paso corto según la etapa:
       guion    -> genera el guion con Gemini.
       voz      -> genera hasta VIDEO_IA_NARRACIONES_POR_PASO narraciones.
       render   -> inicia el render o consulta su estado.
       descarga -> copia el mp4 a Supabase Storage y marca "completado".
   La fila se bloquea con FOR UPDATE SKIP LOCKED: si otra consulta ya la está
   procesando, esta devuelve el estado actual sin hacer nada.
3. Si la copia del mp4 falla o excede su tiempo, el trabajo queda en
   "descarga_pendiente" con su render_id_externo, y POST /{id}/reintentar-descarga
   pide un enlace nuevo al proveedor y vuelve a intentar.
4. POST /{id}/publicar crea el video del manual y enlaza el trabajo en una sola
   transacción. Es idempotente: si ya estaba publicado devuelve el mismo video.

Un trabajo en pendiente o procesando por más de VIDEO_IA_TIEMPO_LIMITE_MINUTOS
pasa a "fallido" automáticamente y libera al usuario. Excepción: si estaba en
etapa render o descarga y el proveedor confirma que el render terminó, pasa a
"descarga_pendiente" para no perder un video ya pagado.

Duración de cada paso de "avanzar" (medida con un video de 3 escenas y 22 s):
    guion     ~3 s. Una llamada a Gemini; peor caso unos 45 s (2 intentos de 20 s).
    voz       ~6 s por lote de hasta 4 narraciones (unos 2 s por narración).
    render    ~9 s al iniciar: descarga los WAV y las capturas, arma el zip,
              lo sube a HeyGen y crea el render. Es el paso más largo de los
              fijos y crece con la cantidad de escenas (20 escenas: decenas de
              segundos). Las consultas de estado siguientes duran ~1 s.
    descarga  ~5 s para 3,3 MB. Es el paso más largo en videos largos: un video
              de 5 minutos pesaría unos 45 MB y tardaría entre 30 y 80 s. Lo
              corta VIDEO_IA_TIEMPO_MAX_DESCARGA_SEGUNDOS (240 s).
En Vercel (plan Hobby con Fluid compute) la función del backend puede durar
hasta 300 s, configurado en vercel.json con maxDuration dentro del servicio
backend. Sin Fluid compute el máximo de Hobby es 60 s y la descarga de un
video largo no entraría.

Los recursos subidos al proveedor (el zip del proyecto) se guardan en
recursos_externos y se borran cuando el render termina, falla, se cancela o
el trabajo se elimina.
"""

import copy
import logging
import secrets
import string
import tempfile
import time
import uuid
from datetime import datetime, timedelta

import requests
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import config, schemas
from ..config import SUPABASE_SERVICE_KEY, SUPABASE_URL
from ..database import db, models
from ..services import video_script_generator
from ..services.proveedor_video import (
    RENDER_COMPLETADO,
    RENDER_FALLIDO,
    EscenaRender,
    OpcionesRender,
    obtener_proveedor,
)
from . import auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/videos-ia", tags=["Videos con IA"])

# Rol único para todo el módulo: privilegio mayor (rol 2), igual que "Administrar Videos".
requiere_rol = auth.get_current_reviewer

Trabajo = models.TrabajoGeneracionVideo
ACTIVOS = models.ESTADOS_TRABAJO_VIDEO_ACTIVOS

EXTENSIONES_PERMITIDAS = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png"}
MAX_TAMANO_IMAGEN_BYTES = 5 * 1024 * 1024  # 5 MB
TOLERANCIA_DURACION_REAL_SEGUNDOS = 30


# --- Schemas (locales a este router) ---

class PasoEntrada(BaseModel):
    """Un paso de la solución con su captura opcional."""
    texto: str
    imagen_url: str | None = None


class TrabajoCrear(BaseModel):
    """Datos para crear un trabajo de video con IA."""
    titulo: str
    descripcion_inconveniente: str
    pasos: list[PasoEntrada]
    puntos_a_considerar: str | None = None


class TrabajoSalida(BaseModel):
    """Trabajo de video con IA serializado para la API."""
    id: int
    titulo: str
    descripcion_inconveniente: str
    pasos: list[dict]
    puntos_a_considerar: str | None = None
    guion: dict | None = None
    estado: str
    etapa: str | None = None
    proveedor: str
    render_id_externo: str | None = None
    resolucion: str
    caracteres_narracion: int | None = None
    duracion_estimada_segundos: float | None = None
    duracion_segundos: float | None = None
    costo_estimado_usd: float | None = None
    enlace: str | None = None
    mensaje_error: str | None = None
    video_id: int | None = None
    creado_por: int
    creado_por_nombre: str | None = None
    creado_en: datetime
    actualizado_en: datetime
    completado_en: datetime | None = None

    class Config:
        from_attributes = True


class PublicarEntrada(BaseModel):
    """Ubicación en el manual del video que se crea al publicar el trabajo."""
    titulo: str | None = None
    seccion_id: int
    capitulo: str
    seccion: str | None = None
    subseccion: str | None = None


class PublicacionSalida(BaseModel):
    """Resultado de publicar: el trabajo enlazado y el video creado."""
    trabajo: TrabajoSalida
    video: schemas.VideoResponse


class ConfiguracionSalida(BaseModel):
    """Límites vigentes del módulo, para mostrarlos en el panel."""
    proveedor: str
    resolucion: str
    max_escenas: int
    max_caracteres: int
    max_duracion_segundos: int
    max_trabajos_por_dia: int
    tiempo_limite_minutos: int


# --- Estimaciones ---

def estimar_duracion(caracteres: int, n_escenas: int) -> float:
    """Duración estimada a partir de los caracteres hablados y la pausa entre escenas."""
    return round(caracteres / config.VIDEO_IA_CARACTERES_POR_SEGUNDO + n_escenas * config.VIDEO_IA_PAUSA_ESCENA_SEGUNDOS, 2)


def estimar_costo(caracteres: int, duracion_segundos: float) -> float:
    """Costo estimado en USD: voz por caracteres más render por segundos (siempre 1080p)."""
    voz = caracteres * config.VIDEO_IA_PRECIO_VOZ_USD_POR_MILLON_CARACTERES / 1_000_000
    render = duracion_segundos * config.VIDEO_IA_PRECIO_RENDER_USD_POR_SEGUNDO
    return round(voz + render, 4)


# --- Utilidades de trabajos ---

def _obtener_trabajo(db_session: Session, trabajo_id: int, bloquear: bool = False) -> Trabajo:
    """Devuelve el trabajo o lanza 404. Con bloquear=True toma la fila con FOR UPDATE."""
    consulta = db_session.query(Trabajo).filter(Trabajo.id == trabajo_id)
    if bloquear:
        consulta = consulta.with_for_update()
    trabajo = consulta.first()
    if not trabajo:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado.")
    return trabajo


def _agregar_recursos(trabajo: Trabajo, ids: list[str]) -> None:
    """Registra ids de recursos subidos al proveedor para borrarlos al terminar."""
    if ids:
        trabajo.recursos_externos = list(trabajo.recursos_externos or []) + list(ids)
        flag_modified(trabajo, "recursos_externos")


def _limpiar_recursos(trabajo: Trabajo) -> None:
    """Best-effort: borra en el proveedor los recursos subidos (capturas, audios, zip)."""
    ids = list(trabajo.recursos_externos or [])
    if not ids:
        return
    try:
        obtener_proveedor(trabajo.proveedor).borrar_recursos(ids)
        trabajo.recursos_externos = []
        flag_modified(trabajo, "recursos_externos")
    except Exception:
        logger.warning("No se pudieron borrar los recursos del trabajo %s en el proveedor", trabajo.id, exc_info=True)


def _cancelar_en_proveedor(trabajo: Trabajo) -> str | None:
    """Pide al proveedor borrar el render. Devuelve un mensaje de error si no se pudo."""
    if not trabajo.render_id_externo:
        return None
    try:
        obtener_proveedor(trabajo.proveedor).cancelar(trabajo.render_id_externo)
        return None
    except Exception as exc:
        logger.warning("No se pudo cancelar el render %s en el proveedor", trabajo.render_id_externo, exc_info=True)
        return f"No se pudo borrar el render en el proveedor: {exc}"


def _fallar(trabajo: Trabajo, mensaje: str) -> None:
    """Marca el trabajo como fallido, detiene el render y limpia los recursos externos."""
    error_cancelacion = _cancelar_en_proveedor(trabajo)
    trabajo.estado = "fallido"
    trabajo.mensaje_error = mensaje if not error_cancelacion else f"{mensaje} {error_cancelacion}"
    _limpiar_recursos(trabajo)


def _recuperar_render_terminado(trabajo: Trabajo) -> bool:
    """
    Antes de fallar por tiempo un trabajo en etapa render o descarga, consulta
    al proveedor. Si el render ya terminó, el trabajo pasa a "descarga_pendiente"
    (recuperable con reintentar-descarga) en vez de fallido, y el render no se
    borra. Devuelve True si lo recuperó.
    """
    if trabajo.etapa not in ("render", "descarga") or not trabajo.render_id_externo:
        return False
    try:
        estado = obtener_proveedor(trabajo.proveedor).consultar_render(trabajo.render_id_externo)
    except Exception:
        logger.warning("No se pudo consultar el render vencido del trabajo %s", trabajo.id, exc_info=True)
        return False
    if estado.estado != RENDER_COMPLETADO:
        return False
    if estado.duracion_segundos is not None:
        trabajo.duracion_segundos = estado.duracion_segundos
    trabajo.estado = "descarga_pendiente"
    trabajo.etapa = "descarga"
    trabajo.mensaje_error = "El render terminó, pero el video no se copió dentro del tiempo límite. Reintentá la descarga."
    _limpiar_recursos(trabajo)
    return True


def _vencer_trabajos(db_session: Session, usuario_id: int | None = None, trabajo_id: int | None = None) -> None:
    """
    Pasa a fallido los trabajos activos que superaron el tiempo límite, salvo
    los que ya tienen el render terminado (ver _recuperar_render_terminado).
    """
    limite = datetime.utcnow() - timedelta(minutes=config.VIDEO_IA_TIEMPO_LIMITE_MINUTOS)
    consulta = db_session.query(Trabajo).filter(Trabajo.estado.in_(ACTIVOS), Trabajo.creado_en < limite)
    if usuario_id is not None:
        consulta = consulta.filter(Trabajo.creado_por == usuario_id)
    if trabajo_id is not None:
        consulta = consulta.filter(Trabajo.id == trabajo_id)
    vencidos = consulta.with_for_update(skip_locked=True).all()
    for trabajo in vencidos:
        if _recuperar_render_terminado(trabajo):
            continue
        _fallar(trabajo, f"Se superó el tiempo límite de {config.VIDEO_IA_TIEMPO_LIMITE_MINUTOS} minutos.")
    if vencidos:
        db_session.commit()


def _url_captura(trabajo: Trabajo, captura: int | None) -> str | None:
    """Resuelve la referencia de captura de una escena con la imagen de ese paso."""
    if not captura:
        return None
    pasos = trabajo.pasos or []
    if 1 <= captura <= len(pasos):
        return pasos[captura - 1].get("imagen_url")
    return None


# --- Supabase Storage ---

def _cabeceras_storage(content_type: str | None = None) -> dict:
    cabeceras = {"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}", "apikey": SUPABASE_SERVICE_KEY}
    if content_type:
        cabeceras["Content-Type"] = content_type
    return cabeceras


def _verificar_storage() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise RuntimeError("Supabase Storage no está configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY faltantes).")


_ALFABETO_NOMBRE = string.ascii_lowercase + string.digits


def _nombre_video(trabajo_id: int) -> str:
    """
    Nombre del mp4 en Storage con un sufijo aleatorio de 16 caracteres, para
    que la URL pública del bucket no se pueda adivinar a partir del id.
    """
    sufijo = "".join(secrets.choice(_ALFABETO_NOMBRE) for _ in range(16))
    return f"trabajo-{trabajo_id}-{sufijo}.mp4"


def _copiar_video_a_storage(url_origen: str, nombre_archivo: str) -> str:
    """
    Descarga el mp4 en streaming a un archivo temporal y lo sube a Storage con
    la subida estándar (validada con 160 MB; el límite del proyecto es 500 MB).
    Corta si se supera VIDEO_IA_TIEMPO_MAX_DESCARGA_SEGUNDOS. Cada intento usa
    un nombre aleatorio nuevo, así que un reintento nunca pisa otro archivo.
    """
    _verificar_storage()
    maximo = config.VIDEO_IA_TIEMPO_MAX_DESCARGA_SEGUNDOS
    inicio = time.monotonic()
    with tempfile.TemporaryFile() as temporal:
        with requests.get(url_origen, stream=True, timeout=(10, 30)) as respuesta:
            respuesta.raise_for_status()
            for bloque in respuesta.iter_content(chunk_size=1024 * 1024):
                temporal.write(bloque)
                if time.monotonic() - inicio > maximo:
                    raise TimeoutError(f"La descarga del video superó {maximo} segundos.")
        tamano = temporal.tell()
        temporal.seek(0)
        restante = max(maximo - (time.monotonic() - inicio), 10)
        bucket = config.SUPABASE_BUCKET_VIDEOS_IA
        subida = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/{bucket}/{nombre_archivo}",
            headers={**_cabeceras_storage("video/mp4"), "Content-Length": str(tamano)},
            data=temporal,
            timeout=(10, restante),
        )
    if subida.status_code not in (200, 201):
        raise RuntimeError(f"No se pudo subir el video a Supabase Storage: {subida.text[:300]}")
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{nombre_archivo}"


def _eliminar_de_storage(bucket: str, url_publica: str | None) -> None:
    """Best-effort: borra un archivo de Storage a partir de su URL pública. Nunca lanza."""
    marcador = f"/storage/v1/object/public/{bucket}/"
    if not url_publica or marcador not in url_publica:
        return
    ruta = url_publica.split(marcador, 1)[1]
    try:
        requests.delete(f"{SUPABASE_URL}/storage/v1/object/{bucket}/{ruta}", headers=_cabeceras_storage(), timeout=10)
    except Exception:
        logger.warning("No se pudo borrar de Storage: %s/%s", bucket, ruta, exc_info=True)


# --- Pasos del trabajo ---

def _paso_guion(trabajo: Trabajo) -> None:
    """Genera el guion y controla los límites de caracteres y duración."""
    escenas = video_script_generator.generar_guion(
        titulo=trabajo.titulo,
        descripcion=trabajo.descripcion_inconveniente,
        pasos=[p.get("texto", "") for p in trabajo.pasos or []],
        puntos=trabajo.puntos_a_considerar,
    )
    caracteres = sum(len(video_script_generator.texto_hablado(e["narracion"])) for e in escenas)
    if caracteres > config.VIDEO_IA_MAX_CARACTERES:
        raise ValueError(f"El guion tiene {caracteres} caracteres de narración; el máximo es {config.VIDEO_IA_MAX_CARACTERES}.")
    duracion = estimar_duracion(caracteres, len(escenas))
    if duracion > config.VIDEO_IA_MAX_DURACION_SEGUNDOS:
        raise ValueError(f"La duración estimada ({duracion:.0f} s) supera el máximo de {config.VIDEO_IA_MAX_DURACION_SEGUNDOS} s.")

    trabajo.guion = {"escenas": escenas}
    trabajo.caracteres_narracion = caracteres
    trabajo.duracion_estimada_segundos = duracion
    trabajo.costo_estimado_usd = estimar_costo(caracteres, duracion)
    trabajo.etapa = "voz"


def _paso_voz(trabajo: Trabajo) -> None:
    """Genera un lote de narraciones. Guarda el avance escena por escena."""
    proveedor = obtener_proveedor(trabajo.proveedor)
    guion = copy.deepcopy(trabajo.guion or {})
    escenas = guion.get("escenas", [])
    pendientes = [e for e in escenas if not e.get("audio_url")][: config.VIDEO_IA_NARRACIONES_POR_PASO]

    for escena in pendientes:
        narracion = proveedor.generar_narracion(escena["narracion"])
        escena["audio_url"] = narracion.audio_url
        escena["duracion_segundos"] = narracion.duracion_segundos
        # Se asigna en cada vuelta para no perder el avance (ni los recursos) si la siguiente falla.
        trabajo.guion = copy.deepcopy(guion)
        flag_modified(trabajo, "guion")
        _agregar_recursos(trabajo, narracion.recursos)

    if all(e.get("audio_url") for e in escenas):
        total = round(sum(e["duracion_segundos"] for e in escenas) + len(escenas) * config.VIDEO_IA_PAUSA_ESCENA_SEGUNDOS, 2)
        if total > config.VIDEO_IA_MAX_DURACION_SEGUNDOS:
            raise ValueError(f"La narración dura {total:.0f} s y el máximo es {config.VIDEO_IA_MAX_DURACION_SEGUNDOS} s.")
        trabajo.duracion_estimada_segundos = total
        trabajo.costo_estimado_usd = estimar_costo(trabajo.caracteres_narracion or 0, total)
        trabajo.etapa = "render"


def _paso_render(trabajo: Trabajo) -> None:
    """Inicia el render (siempre 1080p) o consulta su estado si ya se inició."""
    proveedor = obtener_proveedor(trabajo.proveedor)

    if not trabajo.render_id_externo:
        escenas = [
            EscenaRender(
                titulo=e["titulo"],
                imagen_url=_url_captura(trabajo, e.get("captura")),
                audio_url=e["audio_url"],
                duracion_segundos=e["duracion_segundos"],
            )
            for e in (trabajo.guion or {}).get("escenas", [])
        ]
        # La clave de idempotencia evita un render duplicado si esta petición se repite.
        opciones = OpcionesRender(clave_idempotencia=f"trabajo-video-{trabajo.id}", titulo=trabajo.titulo)
        inicio = proveedor.iniciar_render(escenas, opciones)
        trabajo.render_id_externo = inicio.render_id
        _agregar_recursos(trabajo, inicio.recursos)
        return

    estado = proveedor.consultar_render(trabajo.render_id_externo)
    if estado.estado == RENDER_FALLIDO:
        raise RuntimeError(estado.mensaje_error or "El render falló en el proveedor.")
    if estado.estado == RENDER_COMPLETADO:
        maximo = config.VIDEO_IA_MAX_DURACION_SEGUNDOS + TOLERANCIA_DURACION_REAL_SEGUNDOS
        if estado.duracion_segundos and estado.duracion_segundos > maximo:
            raise ValueError(f"El video renderizado dura {estado.duracion_segundos:.0f} s y supera el máximo.")
        trabajo.duracion_segundos = estado.duracion_segundos
        trabajo.etapa = "descarga"
        # El zip ya no hace falta una vez renderizado: se borra del proveedor.
        _limpiar_recursos(trabajo)


def _paso_descarga(trabajo: Trabajo) -> None:
    """
    Pide un enlace vigente al proveedor y copia el mp4 a Storage. Si falla,
    deja el trabajo en "descarga_pendiente" (recuperable) con su render_id_externo.
    """
    try:
        estado = obtener_proveedor(trabajo.proveedor).consultar_render(trabajo.render_id_externo)
        if estado.estado != RENDER_COMPLETADO or not estado.enlace_descarga:
            raise RuntimeError("El proveedor no devolvió un enlace de descarga para el render.")
        enlace = _copiar_video_a_storage(estado.enlace_descarga, _nombre_video(trabajo.id))
    except Exception as exc:
        logger.warning("Copia del mp4 del trabajo %s fallida; queda recuperable", trabajo.id, exc_info=True)
        trabajo.estado = "descarga_pendiente"
        trabajo.mensaje_error = f"El render terminó pero no se pudo copiar el video: {exc}. Reintentá la descarga."
        return

    trabajo.enlace = enlace
    trabajo.estado = "completado"
    trabajo.etapa = None
    trabajo.mensaje_error = None
    trabajo.completado_en = datetime.utcnow()


def _ejecutar_paso(trabajo: Trabajo) -> None:
    """Ejecuta el paso que corresponde a la etapa actual. Cualquier error falla el trabajo."""
    try:
        if trabajo.estado == "pendiente":
            trabajo.estado = "procesando"
            trabajo.etapa = "guion"
        if trabajo.etapa == "guion":
            _paso_guion(trabajo)
        elif trabajo.etapa == "voz":
            _paso_voz(trabajo)
        elif trabajo.etapa == "render":
            _paso_render(trabajo)
        elif trabajo.etapa == "descarga":
            _paso_descarga(trabajo)
    except Exception as exc:
        logger.exception("Error en el paso %s del trabajo %s", trabajo.etapa, trabajo.id)
        _fallar(trabajo, str(exc) or exc.__class__.__name__)


# --- Endpoints ---

@router.get("/configuracion", response_model=ConfiguracionSalida, summary="Límites del módulo de videos con IA")
def obtener_configuracion(current_user: models.User = Depends(requiere_rol)):
    """Devuelve los límites vigentes para que el panel los muestre y valide."""
    return ConfiguracionSalida(
        proveedor=config.VIDEO_IA_PROVEEDOR,
        resolucion=config.VIDEO_IA_RESOLUCION,
        max_escenas=config.VIDEO_IA_MAX_ESCENAS,
        max_caracteres=config.VIDEO_IA_MAX_CARACTERES,
        max_duracion_segundos=config.VIDEO_IA_MAX_DURACION_SEGUNDOS,
        max_trabajos_por_dia=config.VIDEO_IA_MAX_TRABAJOS_POR_DIA,
        tiempo_limite_minutos=config.VIDEO_IA_TIEMPO_LIMITE_MINUTOS,
    )


@router.post("/imagenes", response_model=schemas.ImagenUploadResponse, summary="Subir captura de un paso")
def subir_imagen(file: UploadFile = File(...), current_user: models.User = Depends(requiere_rol)):
    """Sube una captura JPG o PNG (máximo 5 MB) a Supabase Storage y devuelve su URL pública."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase Storage no está configurado.")
    extension = EXTENSIONES_PERMITIDAS.get(file.content_type)
    if not extension:
        raise HTTPException(status_code=400, detail="Solo se permiten imágenes en formato JPG, JPEG o PNG.")
    contenido = file.file.read()
    if len(contenido) > MAX_TAMANO_IMAGEN_BYTES:
        raise HTTPException(status_code=400, detail="La imagen no debe superar los 5 MB.")

    bucket = config.SUPABASE_BUCKET_VIDEOS_IA_IMAGENES
    nombre = f"{uuid.uuid4().hex}.{extension}"
    respuesta = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{nombre}",
        headers=_cabeceras_storage(file.content_type),
        data=contenido,
        timeout=30,
    )
    if respuesta.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"No se pudo subir la imagen a Supabase Storage: {respuesta.text[:300]}")
    return {"url": f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{nombre}"}


@router.post("", response_model=TrabajoSalida, status_code=status.HTTP_201_CREATED, summary="Crear trabajo de video")
def crear_trabajo(
    datos: TrabajoCrear,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(requiere_rol),
):
    """
    Crea el trabajo en "pendiente". No llama a servicios externos. Aplica los
    límites: escenas, caracteres, duración estimada, un trabajo activo por
    usuario y máximo de trabajos por día.
    """
    if not datos.titulo.strip() or not datos.descripcion_inconveniente.strip():
        raise HTTPException(status_code=400, detail="El título y la descripción son obligatorios.")
    pasos = [p for p in datos.pasos if p.texto.strip()]
    if not pasos:
        raise HTTPException(status_code=400, detail="Agregá al menos un paso de la solución con texto.")

    puntos = (datos.puntos_a_considerar or "").strip() or None
    n_escenas = video_script_generator.escenas_esperadas(len(pasos), bool(puntos))
    if n_escenas > config.VIDEO_IA_MAX_ESCENAS:
        raise HTTPException(status_code=400, detail=f"El video tendría {n_escenas} escenas; el máximo es {config.VIDEO_IA_MAX_ESCENAS}.")

    caracteres = len(datos.descripcion_inconveniente.strip()) + sum(len(p.texto.strip()) for p in pasos) + len(puntos or "")
    if caracteres > config.VIDEO_IA_MAX_CARACTERES:
        raise HTTPException(status_code=400, detail=f"El texto suma {caracteres} caracteres; el máximo es {config.VIDEO_IA_MAX_CARACTERES}.")
    duracion = estimar_duracion(caracteres, n_escenas)
    if duracion > config.VIDEO_IA_MAX_DURACION_SEGUNDOS:
        raise HTTPException(status_code=400, detail=f"La duración estimada ({duracion:.0f} s) supera el máximo de {config.VIDEO_IA_MAX_DURACION_SEGUNDOS} s.")

    _vencer_trabajos(db_session, usuario_id=current_user.id)

    # Serializa las creaciones de un mismo usuario para que los conteos sean exactos.
    db_session.query(models.User).filter(models.User.id == current_user.id).with_for_update().one()
    activos = db_session.query(Trabajo).filter(Trabajo.creado_por == current_user.id, Trabajo.estado.in_(ACTIVOS)).count()
    if activos:
        raise HTTPException(status_code=409, detail="Ya tenés un video generándose. Esperá a que termine o cancelalo.")
    inicio_dia = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    hoy = db_session.query(Trabajo).filter(Trabajo.creado_por == current_user.id, Trabajo.creado_en >= inicio_dia).count()
    if hoy >= config.VIDEO_IA_MAX_TRABAJOS_POR_DIA:
        raise HTTPException(status_code=429, detail=f"Alcanzaste el máximo de {config.VIDEO_IA_MAX_TRABAJOS_POR_DIA} videos por día.")

    trabajo = Trabajo(
        titulo=datos.titulo.strip(),
        descripcion_inconveniente=datos.descripcion_inconveniente.strip(),
        pasos=[{"texto": p.texto.strip(), "imagen_url": p.imagen_url} for p in pasos],
        puntos_a_considerar=puntos,
        estado="pendiente",
        proveedor=config.VIDEO_IA_PROVEEDOR,
        resolucion=config.VIDEO_IA_RESOLUCION,
        recursos_externos=[],
        caracteres_narracion=caracteres,
        duracion_estimada_segundos=duracion,
        costo_estimado_usd=estimar_costo(caracteres, duracion),
        creado_por=current_user.id,
    )
    db_session.add(trabajo)
    try:
        db_session.commit()
    except IntegrityError:
        # El índice único parcial también impide dos trabajos activos simultáneos.
        db_session.rollback()
        raise HTTPException(status_code=409, detail="Ya tenés un video generándose. Esperá a que termine o cancelalo.")
    db_session.refresh(trabajo)
    return trabajo


@router.get("", response_model=list[TrabajoSalida], summary="Listar trabajos de video")
def listar_trabajos(db_session: Session = Depends(db.get_db), current_user: models.User = Depends(requiere_rol)):
    """Devuelve los últimos 50 trabajos, del más reciente al más antiguo."""
    _vencer_trabajos(db_session)
    return db_session.query(Trabajo).order_by(Trabajo.creado_en.desc()).limit(50).all()


@router.get("/{trabajo_id}", response_model=TrabajoSalida, summary="Consultar un trabajo")
def obtener_trabajo(trabajo_id: int, db_session: Session = Depends(db.get_db), current_user: models.User = Depends(requiere_rol)):
    """Devuelve el trabajo sin avanzarlo."""
    return _obtener_trabajo(db_session, trabajo_id)


@router.post("/{trabajo_id}/avanzar", response_model=TrabajoSalida, summary="Avanzar un paso del trabajo")
def avanzar_trabajo(trabajo_id: int, db_session: Session = Depends(db.get_db), current_user: models.User = Depends(requiere_rol)):
    """
    El panel lo llama cada pocos segundos. Ejecuta un solo paso corto. Si otra
    consulta ya está procesando el trabajo, devuelve el estado actual.
    """
    _vencer_trabajos(db_session, trabajo_id=trabajo_id)
    trabajo = db_session.query(Trabajo).filter(Trabajo.id == trabajo_id).with_for_update(skip_locked=True).first()
    if trabajo is None:
        return _obtener_trabajo(db_session, trabajo_id)
    if trabajo.estado in ACTIVOS:
        _ejecutar_paso(trabajo)
        db_session.commit()
        if trabajo.estado == "completado":
            _limpiar_recursos(trabajo)
            db_session.commit()
        db_session.refresh(trabajo)
    else:
        db_session.rollback()
    return trabajo


@router.post("/{trabajo_id}/reintentar-descarga", response_model=TrabajoSalida, summary="Reintentar la copia del video")
def reintentar_descarga(trabajo_id: int, db_session: Session = Depends(db.get_db), current_user: models.User = Depends(requiere_rol)):
    """Para trabajos en "descarga_pendiente": pide un enlace nuevo al proveedor y copia el mp4."""
    trabajo = _obtener_trabajo(db_session, trabajo_id, bloquear=True)
    if trabajo.estado != "descarga_pendiente" or not trabajo.render_id_externo:
        raise HTTPException(status_code=409, detail="Este trabajo no tiene una descarga pendiente.")
    _paso_descarga(trabajo)  # si vuelve a fallar, sigue en descarga_pendiente con el motivo
    db_session.commit()
    if trabajo.estado == "completado":
        _limpiar_recursos(trabajo)
        db_session.commit()
    db_session.refresh(trabajo)
    return trabajo


@router.post("/{trabajo_id}/cancelar", response_model=TrabajoSalida, summary="Cancelar un trabajo")
def cancelar_trabajo(trabajo_id: int, db_session: Session = Depends(db.get_db), current_user: models.User = Depends(requiere_rol)):
    """
    Pide al proveedor borrar el render (si ya se inició), borra los recursos
    subidos y marca el trabajo como cancelado. Si el proveedor no responde,
    el trabajo igual se cancela para liberar al usuario y el error queda
    registrado en mensaje_error.
    """
    trabajo = _obtener_trabajo(db_session, trabajo_id, bloquear=True)
    if trabajo.estado not in ACTIVOS:
        raise HTTPException(status_code=400, detail="Solo se puede cancelar un video pendiente o en proceso.")
    error_cancelacion = _cancelar_en_proveedor(trabajo)
    trabajo.estado = "cancelado"
    trabajo.mensaje_error = "Cancelado por el usuario." + (f" {error_cancelacion}" if error_cancelacion else "")
    _limpiar_recursos(trabajo)
    db_session.commit()
    db_session.refresh(trabajo)
    return trabajo


@router.post("/{trabajo_id}/publicar", response_model=PublicacionSalida, summary="Publicar en el manual")
def publicar_trabajo(
    trabajo_id: int,
    datos: PublicarEntrada,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(requiere_rol),
):
    """
    Crea el video del manual con el mp4 del trabajo y enlaza el trabajo, en
    una sola transacción. Si el trabajo ya estaba publicado, devuelve el video
    existente sin crear otro.
    """
    trabajo = _obtener_trabajo(db_session, trabajo_id, bloquear=True)

    if trabajo.video_id:
        video = db_session.query(models.Video).filter(models.Video.id == trabajo.video_id).first()
        if video:
            db_session.commit()
            return {"trabajo": trabajo, "video": video}

    if trabajo.estado != "completado" or not trabajo.enlace:
        raise HTTPException(status_code=409, detail="Solo se puede publicar un video completado.")

    video = models.Video(
        titulo=(datos.titulo or trabajo.titulo).strip(),
        enlace=trabajo.enlace,
        seccion_id=datos.seccion_id,
        capitulo=datos.capitulo,
        seccion=datos.seccion,
        subseccion=datos.subseccion,
        creado_por=current_user.id,
    )
    db_session.add(video)
    db_session.flush()  # asigna video.id dentro de la misma transacción
    trabajo.video_id = video.id
    try:
        db_session.commit()
    except IntegrityError:
        db_session.rollback()
        raise HTTPException(status_code=409, detail="El trabajo ya fue publicado. Recargá la lista.")
    db_session.refresh(trabajo)
    db_session.refresh(video)
    return {"trabajo": trabajo, "video": video}


@router.delete("/{trabajo_id}", response_model=schemas.MessageResponse, summary="Eliminar un trabajo")
def eliminar_trabajo(trabajo_id: int, db_session: Session = Depends(db.get_db), current_user: models.User = Depends(requiere_rol)):
    """
    Elimina el trabajo. Antes pide al proveedor borrar el render (en cualquier
    estado: el mp4 ya está copiado en Storage o el trabajo se descarta) y los
    recursos subidos. Si nunca se publicó, también borra su mp4 de Storage;
    si se publicó, el video del manual no se toca.
    """
    trabajo = _obtener_trabajo(db_session, trabajo_id, bloquear=True)
    _cancelar_en_proveedor(trabajo)
    _limpiar_recursos(trabajo)
    if not trabajo.video_id and trabajo.enlace:
        _eliminar_de_storage(config.SUPABASE_BUCKET_VIDEOS_IA, trabajo.enlace)
    db_session.delete(trabajo)
    db_session.commit()
    return {"mensaje": "Trabajo de video eliminado correctamente."}
