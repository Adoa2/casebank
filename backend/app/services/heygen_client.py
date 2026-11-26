"""
Cliente de HeyGen: narración con TTS y render con Hyperframes.

Implementa la interfaz ProveedorVideo (proveedor_video.py). Cada método hace
llamadas cortas, porque el router los ejecuta dentro de un paso de consulta
del panel.

Endpoints usados (API v3, cabecera X-Api-Key):
    Voz:      POST /v3/models/audio/tts. Devuelve audio_url (WAV mono 44,1 kHz
              16 bits) y duration. Pausas con [pause]; sin Markdown.
    Zip:      POST /v3/assets/direct-uploads -> PUT a upload_url (sin la clave)
              -> POST /v3/assets/{id}/complete.
    Render:   POST /v3/hyperframes/renders con Idempotency-Key.
    Estado:   GET /v3/hyperframes/renders/{id}. video_url es prefirmada y
              caduca: se pide de nuevo en cada descarga.
    Borrar:   DELETE /v3/hyperframes/renders/{id} y DELETE /v3/assets/{id}.

La clave HEYGEN_API_KEY nunca se registra ni se incluye en mensajes de error.
"""

import hashlib
import io
import json
import logging
import re
import time
import wave
import zipfile
from pathlib import Path

import requests

from .. import config
from . import almacenamiento
from .proveedor_video import (
    RENDER_COMPLETADO,
    RENDER_EN_CURSO,
    RENDER_FALLIDO,
    EscenaRender,
    EstadoRender,
    InicioRender,
    Narracion,
    OpcionesRender,
    validar_resolucion,
)

logger = logging.getLogger(__name__)

DIRECTORIO_PLANTILLAS = Path(__file__).resolve().parent.parent / "video_templates"

TIMEOUT_API = (10, 60)          # conexión, lectura
TIMEOUT_DESCARGA = (10, 60)
TIMEOUT_SUBIDA_ZIP = (10, 180)
MAX_REINTENTOS = 3

# Formato de audio esperado del TTS (WAV PCM): mono, 44,1 kHz, 16 bits.
CANALES_AUDIO = 1
FRECUENCIA_AUDIO = 44100
BYTES_POR_MUESTRA = 2

TIPOS_IMAGEN = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg"}
MAX_TAMANO_IMAGEN_BYTES = 10 * 1024 * 1024

# Estados de Hyperframes -> estados neutrales.
_ESTADOS = {
    "queued": RENDER_EN_CURSO,
    "rendering": RENDER_EN_CURSO,
    "completed": RENDER_COMPLETADO,
    "failed": RENDER_FALLIDO,
}


class ErrorHeyGen(RuntimeError):
    """Error devuelto por la API de HeyGen (sin datos de la clave)."""


# --- Audio: unión de WAV ---

def unir_wav(audios: list[bytes], pausa_segundos: float) -> tuple[bytes, list[float]]:
    """
    Une los WAV de cada escena en uno solo con pausa_segundos de silencio
    después de cada escena (también después de la última, como margen final).
    Todos deben ser mono, 44,1 kHz, 16 bits; no se convierte el formato
    (no se usa FFmpeg). Devuelve el WAV unido y la duración real de cada audio.
    """
    salida = io.BytesIO()
    duraciones: list[float] = []
    silencio = b"\x00" * (int(round(pausa_segundos * FRECUENCIA_AUDIO)) * CANALES_AUDIO * BYTES_POR_MUESTRA)

    with wave.open(salida, "wb") as destino:
        destino.setnchannels(CANALES_AUDIO)
        destino.setsampwidth(BYTES_POR_MUESTRA)
        destino.setframerate(FRECUENCIA_AUDIO)
        for indice, contenido in enumerate(audios, start=1):
            with wave.open(io.BytesIO(contenido), "rb") as origen:
                formato = (origen.getnchannels(), origen.getsampwidth(), origen.getframerate())
                if formato != (CANALES_AUDIO, BYTES_POR_MUESTRA, FRECUENCIA_AUDIO):
                    raise ValueError(
                        f"El audio de la escena {indice} tiene un formato no soportado "
                        f"(canales, bytes por muestra, Hz) = {formato}; se espera (1, 2, 44100)."
                    )
                cuadros = origen.getnframes()
                destino.writeframes(origen.readframes(cuadros))
            duraciones.append(cuadros / FRECUENCIA_AUDIO)
            destino.writeframes(silencio)
    return salida.getvalue(), duraciones


# --- Plantilla: armado del proyecto ---

_RE_DURACION_RAIZ = re.compile(r'(data-composition-id="[^"]+"[^>]*?data-duration=")[^"]*(")')


def armar_escenas(titulos: list[str], imagenes: list[str | None], duraciones_audio: list[float], pausa: float) -> list[dict]:
    """
    Escenas para la variable "escenas" de la plantilla. Cada escena dura su
    audio real más la pausa (margen fijo al final), así coincide con el WAV unido.
    """
    escenas = []
    inicio = 0.0
    for titulo, imagen, duracion_audio in zip(titulos, imagenes, duraciones_audio):
        duracion = round(duracion_audio + pausa, 3)
        escenas.append({"titulo": titulo, "imagen": imagen, "inicio": round(inicio, 3), "duracion": duracion})
        inicio += duracion
    return escenas


def empaquetar_proyecto(plantilla: str, duracion_total: float, archivos_extra: dict[str, bytes]) -> bytes:
    """
    Arma el zip del proyecto Hyperframes: copia la plantilla, escribe la
    duración total en el elemento raíz de index.html (no puede venir de una
    variable) y agrega la narración y las capturas del trabajo.
    """
    carpeta = DIRECTORIO_PLANTILLAS / plantilla
    indice = carpeta / "index.html"
    if not indice.is_file():
        raise FileNotFoundError(f"No existe la plantilla de video {plantilla}.")

    html = indice.read_text(encoding="utf-8")
    html, reemplazos = _RE_DURACION_RAIZ.subn(rf"\g<1>{duracion_total:.3f}\g<2>", html, count=1)
    if reemplazos != 1:
        raise ValueError("La plantilla no tiene data-duration en el elemento raíz.")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zip_salida:
        for archivo in sorted(carpeta.rglob("*")):
            relativo = archivo.relative_to(carpeta).as_posix()
            if archivo.is_dir() or relativo == "index.html" or relativo.lower().endswith(".md"):
                continue
            zip_salida.write(archivo, relativo)
        zip_salida.writestr("index.html", html)
        for ruta, contenido in archivos_extra.items():
            # El WAV casi no se comprime: se guarda sin compresión para ahorrar tiempo.
            tipo = zipfile.ZIP_STORED if ruta.endswith((".wav", ".png", ".jpg")) else zipfile.ZIP_DEFLATED
            zip_salida.writestr(zipfile.ZipInfo(ruta, date_time=(2026, 1, 1, 0, 0, 0)), contenido, compress_type=tipo)
    return buffer.getvalue()


# --- Cliente ---

class ProveedorHeyGen:
    """Implementación de ProveedorVideo para HeyGen (TTS + Hyperframes)."""

    nombre = "heygen"

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or config.HEYGEN_API_KEY
        self.base_url = config.HEYGEN_API_BASE_URL.rstrip("/")

    # --- HTTP ---

    def _cabeceras(self, extra: dict | None = None) -> dict:
        if not self.api_key:
            raise ErrorHeyGen("Falta HEYGEN_API_KEY.")
        cabeceras = {"X-Api-Key": self.api_key, "Accept": "application/json"}
        if extra:
            cabeceras.update(extra)
        return cabeceras

    def _pedir(self, metodo: str, ruta: str, *, json_body=None, cabeceras: dict | None = None,
               permitir_404: bool = False, timeout=TIMEOUT_API) -> dict:
        """
        Llama a la API con reintentos cortos ante 429 y 5xx. Devuelve el
        cuerpo JSON (o {} si viene vacío). Los errores no incluyen la clave.
        """
        url = f"{self.base_url}{ruta}"
        ultimo = ""
        for intento in range(MAX_REINTENTOS):
            try:
                respuesta = requests.request(metodo, url, json=json_body, headers=self._cabeceras(cabeceras), timeout=timeout)
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
                ultimo = exc.__class__.__name__
                time.sleep(2 ** intento)
                continue

            if respuesta.status_code == 404 and permitir_404:
                return {}
            if respuesta.status_code == 429 or respuesta.status_code >= 500:
                ultimo = f"HTTP {respuesta.status_code}"
                espera = respuesta.headers.get("Retry-After")
                time.sleep(min(float(espera), 10) if espera and espera.replace(".", "", 1).isdigit() else 2 ** intento)
                continue
            if respuesta.status_code >= 400:
                raise ErrorHeyGen(f"HeyGen {metodo} {ruta} respondió {respuesta.status_code}: {_resumen_error(respuesta)}")
            if not respuesta.content:
                return {}
            return respuesta.json()
        raise ErrorHeyGen(f"HeyGen {metodo} {ruta} no respondió tras {MAX_REINTENTOS} intentos ({ultimo}).")

    # --- Voz ---

    def generar_narracion(self, texto: str, pronunciaciones: dict[str, str] | None = None) -> Narracion:
        """
        POST /v3/models/audio/tts con el modelo, la voz y el idioma de config.
        El texto ya viene limpio (sin Markdown) y con pausas [pause].
        pronunciaciones: término -> IPA entre barras; por defecto el de config
        (VIDEO_IA_TTS_PRONUNCIACIONES). Solo los modelos de pago lo admiten.
        """
        if pronunciaciones is None:
            pronunciaciones = config.VIDEO_IA_TTS_PRONUNCIACIONES
        cuerpo = {
            "text": texto,
            "voice_id": config.VIDEO_IA_TTS_VOZ_ID,
            "model": config.VIDEO_IA_TTS_MODELO,
            "language": config.VIDEO_IA_TTS_IDIOMA,
        }
        if pronunciaciones:
            cuerpo["pronunciation_dictionary"] = pronunciaciones
        datos = self._pedir("POST", "/v3/models/audio/tts", json_body=cuerpo).get("data") or {}
        if not datos.get("audio_url"):
            raise ErrorHeyGen("HeyGen no devolvió audio_url para la narración.")
        return Narracion(audio_url=datos["audio_url"], duracion_segundos=float(datos.get("duration") or 0))

    # --- Render ---

    def iniciar_render(self, escenas: list[EscenaRender], opciones: OpcionesRender) -> InicioRender:
        """
        Une las narraciones, arma el zip con la plantilla y las capturas, lo
        sube por subida directa y crea el render (siempre 1080p, 16:9, mp4).
        Si algo falla después de subir el zip, lo borra antes de relanzar.
        """
        validar_resolucion(opciones.resolucion)
        if not escenas:
            raise ValueError("No hay escenas para renderizar.")

        # 1. Narración unida y duración real de cada escena.
        audios = [_descargar(e.audio_url, "audio") for e in escenas]
        narracion, duraciones = unir_wav(audios, config.VIDEO_IA_PAUSA_ESCENA_SEGUNDOS)

        # 2. Capturas dentro del zip (sin depender de URLs externas durante el render).
        archivos = {"assets/narracion.wav": narracion}
        rutas_imagen: list[str | None] = []
        for numero, escena in enumerate(escenas, start=1):
            if not escena.imagen_url:
                rutas_imagen.append(None)
                continue
            contenido, tipo = _descargar_imagen(escena.imagen_url)
            ruta = f"assets/escena-{numero}.{TIPOS_IMAGEN[tipo]}"
            archivos[ruta] = contenido
            rutas_imagen.append(ruta)

        lista = armar_escenas([e.titulo for e in escenas], rutas_imagen, duraciones, config.VIDEO_IA_PAUSA_ESCENA_SEGUNDOS)
        duracion_total = round(sum(e["duracion"] for e in lista), 3)
        zip_bytes = empaquetar_proyecto(config.VIDEO_IA_PLANTILLA, duracion_total, archivos)

        # 3. Subida directa del zip.
        asset_id = self._subir_zip(zip_bytes, opciones.clave_idempotencia)
        try:
            # 4. Render. La clave de idempotencia evita duplicarlo si la petición se repite.
            cuerpo = {
                "project": {"type": "asset_id", "asset_id": asset_id},
                "variables": {
                    "escenas": json.dumps(lista, ensure_ascii=False),
                    "narracion": "assets/narracion.wav",
                    "titulo_video": (opciones.titulo or "")[:200],
                },
                "strict_variables": True,
                "resolution": opciones.resolucion,
                "aspect_ratio": opciones.relacion_aspecto,
                "format": opciones.formato,
                "quality": config.VIDEO_IA_CALIDAD,
            }
            if opciones.titulo:
                cuerpo["title"] = opciones.titulo[:500]
            cabeceras = {"Idempotency-Key": opciones.clave_idempotencia} if opciones.clave_idempotencia else None
            datos = self._pedir("POST", "/v3/hyperframes/renders", json_body=cuerpo, cabeceras=cabeceras).get("data") or {}
            render_id = datos.get("render_id")
            if not render_id:
                raise ErrorHeyGen("HeyGen no devolvió render_id.")
        except Exception:
            self.borrar_recursos([asset_id])
            raise
        return InicioRender(render_id=render_id, recursos=[asset_id])

    def _subir_zip(self, zip_bytes: bytes, clave: str | None) -> str:
        """Subida directa: pide la URL prefirmada, sube los bytes y completa el asset."""
        sha = hashlib.sha256(zip_bytes).hexdigest()
        cabeceras = {"Idempotency-Key": f"{clave}-zip-{sha[:16]}"} if clave else None
        inicio = self._pedir("POST", "/v3/assets/direct-uploads", cabeceras=cabeceras, json_body={
            "filename": "proyecto.zip",
            "content_type": "application/zip",
            "size_bytes": len(zip_bytes),
            "checksum_sha256": sha,
        }).get("data") or {}
        asset_id, upload_url = inicio.get("asset_id"), inicio.get("upload_url")
        if not asset_id or not upload_url:
            raise ErrorHeyGen("HeyGen no devolvió la URL de subida del zip.")
        try:
            # La URL prefirmada no lleva la clave de HeyGen; las cabeceras van tal cual.
            subida = requests.put(upload_url, data=zip_bytes, headers=inicio.get("upload_headers") or {}, timeout=TIMEOUT_SUBIDA_ZIP)
            if subida.status_code not in (200, 201, 204):
                raise ErrorHeyGen(f"La subida del zip falló con HTTP {subida.status_code}.")
            self._pedir("POST", f"/v3/assets/{asset_id}/complete", json_body={})
        except Exception:
            self.borrar_recursos([asset_id])
            raise
        return asset_id

    def consultar_render(self, render_id: str) -> EstadoRender:
        """GET /v3/hyperframes/renders/{id}: estado y enlace de descarga vigente."""
        datos = self._pedir("GET", f"/v3/hyperframes/renders/{render_id}").get("data") or {}
        estado = _ESTADOS.get(datos.get("status"), RENDER_EN_CURSO)
        mensaje = None
        if estado == RENDER_FALLIDO:
            mensaje = " ".join(str(x) for x in (datos.get("failure_code"), datos.get("failure_message")) if x) or "El render falló en HeyGen."
        duracion = datos.get("duration")
        return EstadoRender(
            estado=estado,
            enlace_descarga=datos.get("video_url") if estado == RENDER_COMPLETADO else None,
            duracion_segundos=float(duracion) if duracion is not None else None,
            mensaje_error=mensaje,
        )

    def cancelar(self, render_id: str) -> None:
        """
        DELETE /v3/hyperframes/renders/{id}. HeyGen no tiene un endpoint de
        cancelación: el borrado lo descarta. Si ya no existe, no es un error.
        """
        self._pedir("DELETE", f"/v3/hyperframes/renders/{render_id}", permitir_404=True)

    def borrar_recursos(self, ids: list[str]) -> None:
        """DELETE /v3/assets/{id} por cada recurso. Lanza al final si alguno falló."""
        fallidos = []
        for asset_id in ids:
            try:
                self._pedir("DELETE", f"/v3/assets/{asset_id}", permitir_404=True)
            except Exception:
                logger.warning("No se pudo borrar el asset %s de HeyGen", asset_id, exc_info=True)
                fallidos.append(asset_id)
        if fallidos:
            raise ErrorHeyGen(f"No se pudieron borrar {len(fallidos)} recurso(s) de HeyGen.")


# --- Utilidades ---

def _resumen_error(respuesta: requests.Response) -> str:
    """Código y mensaje del error de HeyGen, recortados."""
    try:
        error = respuesta.json().get("error") or {}
        if isinstance(error, dict):
            return f"{error.get('code', '')} {error.get('message', '')}".strip()[:300]
        return str(error)[:300]
    except ValueError:
        return respuesta.text[:300]


def _descargar(url: str, que: str) -> bytes:
    """Descarga un archivo corto (audio) por HTTPS."""
    if not url.startswith("https://"):
        raise ValueError(f"URL de {que} no permitida.")
    respuesta = requests.get(url, timeout=TIMEOUT_DESCARGA)
    if respuesta.status_code != 200:
        raise RuntimeError(f"No se pudo descargar el {que} (HTTP {respuesta.status_code}).")
    return respuesta.content


def _descargar_imagen(url: str) -> tuple[bytes, str]:
    """
    Lee una captura del almacenamiento. Solo se aceptan URLs del bucket de
    capturas con el proveedor actual (evita que el servidor lea o descargue
    URLs arbitrarias). En modo local se lee del disco; en supabase se descarga
    de su URL pública, como antes. El tipo se deduce de la firma de los bytes.
    """
    bucket = config.SUPABASE_BUCKET_VIDEOS_IA_IMAGENES
    nombre = almacenamiento.nombre_desde_url(bucket, url)
    if not nombre:
        raise ValueError("La captura no pertenece al bucket de capturas de videos con IA.")
    try:
        contenido = almacenamiento.leer(bucket, nombre, timeout=TIMEOUT_DESCARGA)
    except almacenamiento.ErrorAlmacenamiento as exc:
        raise RuntimeError(f"No se pudo leer una captura: {exc}") from exc
    tipo = almacenamiento.tipo_imagen_por_firma(contenido) or ""
    if tipo not in TIPOS_IMAGEN:
        raise ValueError("La captura no es PNG ni JPG.")
    if len(contenido) > MAX_TAMANO_IMAGEN_BYTES:
        raise ValueError("La captura supera el tamaño máximo.")
    return contenido, tipo
