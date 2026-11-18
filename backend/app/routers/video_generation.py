# TODO: DESHABILITADO TEMPORALMENTE - generación de videos IA
# Este router está desregistrado en main.py y no se carga en producción.
"""
Router del módulo de generación automática de video tutoriales (Shotstack).

Todos los imports y patrones están confirmados contra tu código real
(errors.py, videos.py, rag_query.py, main.py, models.py). Sin placeholders.
"""

import logging
import uuid
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import models, db
from .. import schemas
from ..config import (
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SUPABASE_BUCKET_VIDEOS_GENERADOS,
    SUPABASE_BUCKET_VIDEO_GEN_IMAGENES,
    VIDEO_GENERACION_INTRO_IMAGEN_URL,
    VIDEO_GENERACION_OUTRO_IMAGEN_URL,
)
from . import auth
from ..services import video_script_generator, shotstack_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/video-generation", tags=["Generación de video tutoriales"])

EXTENSIONES_PERMITIDAS = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
}
MAX_TAMANO_IMAGEN_BYTES = 5 * 1024 * 1024  # 5 MB

# Intro y despedida "de marca" (Casey), fijas y fuera del guion generado por IA.
# Si VIDEO_GENERACION_INTRO_IMAGEN_URL / _OUTRO_ están vacías (no configuradas
# todavía en .env), esa escena simplemente no se agrega — no rompe nada.
TEXTO_INTRO_NARRACION = (
    "Hola, soy Casey, el asistente virtual de CaseBank. Hoy vamos a ver cómo "
    "resolver el siguiente inconveniente."
)
TEXTO_OUTRO_NARRACION = (
    "Eso es todo por este tutorial. Si tenés dudas, podés volver a consultarme "
    "cuando quieras. Hasta la próxima."
)


def _escena_intro() -> dict:
    return {
        "titulo_pantalla": "Hola, soy Casey",
        "texto_narracion": TEXTO_INTRO_NARRACION,
        "imagen_url": VIDEO_GENERACION_INTRO_IMAGEN_URL,
    }


def _escena_outro() -> dict:
    return {
        "titulo_pantalla": "Gracias por ver este tutorial",
        "texto_narracion": TEXTO_OUTRO_NARRACION,
        "imagen_url": VIDEO_GENERACION_OUTRO_IMAGEN_URL,
    }


# ---------- Schemas (locales a este router; no toca schemas.py) ----------

class PasoInput(BaseModel):
    texto: str
    imagen_url: str | None = None


class VideoGenerationCreate(BaseModel):
    titulo: str
    descripcion_inconveniente: str
    pasos: list[PasoInput]  # al menos 1, cada uno con su texto y su imagen opcional
    puntos_a_considerar: str | None = None


class VideoGenerationOut(BaseModel):
    id: int
    titulo: str
    descripcion_inconveniente: str
    pasos_json: list[dict] | None = None
    puntos_a_considerar: str | None = None
    estado: str
    video_url: str | None = None
    video_id: int | None = None  # si no es None, ya se vinculó a un video del manual
    error_mensaje: str | None = None

    class Config:
        from_attributes = True


# ---------- Subida de imágenes de respaldo (mismo patrón que errors.py) ----------

@router.post(
    "/upload-imagen",
    response_model=schemas.ImagenUploadResponse,
    summary="Subir imagen de respaldo para generación de video",
)
def subir_imagen_video_generacion(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_admin),
):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase Storage no está configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY faltantes).",
        )

    extension = EXTENSIONES_PERMITIDAS.get(file.content_type)
    if not extension:
        raise HTTPException(status_code=400, detail="Solo se permiten imágenes en formato JPG, JPEG o PNG.")

    contenido = file.file.read()
    if len(contenido) > MAX_TAMANO_IMAGEN_BYTES:
        raise HTTPException(status_code=400, detail="La imagen no debe superar los 5 MB.")

    nombre_archivo = f"{uuid.uuid4().hex}.{extension}"
    url_subida = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET_VIDEO_GEN_IMAGENES}/{nombre_archivo}"

    respuesta = requests.post(
        url_subida,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": file.content_type,
        },
        data=contenido,
    )

    if respuesta.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo subir la imagen a Supabase Storage: {respuesta.text[:300]}",
        )

    url_publica = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET_VIDEO_GEN_IMAGENES}/{nombre_archivo}"
    return {"url": url_publica}


def _subir_video_a_storage(contenido: bytes, nombre_archivo: str) -> str:
    """Sube el mp4 final a Supabase Storage. Mismo patrón que subir_imagen_evidencia en errors.py."""
    url_subida = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET_VIDEOS_GENERADOS}/{nombre_archivo}"
    respuesta = requests.post(
        url_subida,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": "video/mp4",
        },
        data=contenido,
    )
    if respuesta.status_code not in (200, 201):
        raise RuntimeError(f"No se pudo subir el video a Supabase Storage: {respuesta.text[:300]}")
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET_VIDEOS_GENERADOS}/{nombre_archivo}"


# ---------- Generación ----------

def _procesar_generacion(job: "models.VideoGenerationJob", db_session: Session) -> None:
    """Genera guion, arma timeline (con la imagen exacta de cada paso) y envía el render a Shotstack."""
    try:
        pasos = job.pasos_json or []
        pasos_textos = [p.get("texto", "") for p in pasos]

        escenas = video_script_generator.generar_guion(
            titulo=job.titulo,
            descripcion=job.descripcion_inconveniente,
            pasos=pasos_textos,
            puntos=job.puntos_a_considerar,
        )
        job.guion_json = {"escenas": escenas}

        # Alinear cada escena con su imagen: escena 0 = introducción (sin imagen),
        # escenas 1..N = una por paso (con la imagen de ESE paso), última escena
        # extra = puntos a considerar (sin imagen), si corresponde. El orden y la
        # cantidad de escenas ya vienen validados 1 a 1 contra "pasos" desde
        # video_script_generator.generar_guion.
        escenas[0]["imagen_url"] = None
        for i, paso in enumerate(pasos):
            escenas[i + 1]["imagen_url"] = paso.get("imagen_url")
        if job.puntos_a_considerar and job.puntos_a_considerar.strip():
            escenas[-1]["imagen_url"] = None

        # Intro/outro de marca (Casey), fijas: se agregan DESPUÉS de asignar las
        # imágenes de cada paso, para no correr los índices de arriba.
        if VIDEO_GENERACION_INTRO_IMAGEN_URL:
            escenas.insert(0, _escena_intro())
        if VIDEO_GENERACION_OUTRO_IMAGEN_URL:
            escenas.append(_escena_outro())

        payload = shotstack_client.construir_timeline(escenas)
        render_id = shotstack_client.enviar_render(payload)

        job.shotstack_render_id = render_id
        job.estado = "procesando"
        job.error_mensaje = None

    except Exception as exc:
        logger.exception("Error generando video para job %s", job.id)
        job.estado = "fallido"
        job.error_mensaje = str(exc)

    db_session.commit()


@router.post("/generar", response_model=VideoGenerationOut, status_code=status.HTTP_201_CREATED)
def generar_video(
    datos: VideoGenerationCreate,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    pasos_validos = [p for p in datos.pasos if p.texto.strip()]
    if not pasos_validos:
        raise HTTPException(status_code=400, detail="Agregá al menos un paso de la solución con texto.")

    # Se guarda tambien un texto plano (numerado) para lectura/registro humano,
    # aunque la generacion real usa pasos_json (con la imagen de cada paso).
    solucion_texto = "\n".join(f"{i + 1}. {p.texto.strip()}" for i, p in enumerate(pasos_validos))
    imagenes_planas = [p.imagen_url for p in pasos_validos if p.imagen_url]

    job = models.VideoGenerationJob(
        titulo=datos.titulo,
        descripcion_inconveniente=datos.descripcion_inconveniente,
        solucion=solucion_texto,
        pasos_json=[p.model_dump() for p in pasos_validos],
        puntos_a_considerar=datos.puntos_a_considerar,
        imagenes=imagenes_planas,
        estado="pendiente",
        creado_por=current_user.id,
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    _procesar_generacion(job, db_session)
    db_session.refresh(job)

    if job.estado == "fallido":
        raise HTTPException(status_code=502, detail=job.error_mensaje or "No se pudo iniciar la generación del video.")

    return job


# ---------- Completar job (compartido entre webhook y consulta manual) ----------

def _completar_job(
    job: "models.VideoGenerationJob",
    shotstack_status: str | None,
    video_url_shotstack: str | None,
    error: str | None,
    db_session: Session,
) -> None:
    if shotstack_status == "done" and video_url_shotstack:
        try:
            video_bytes = requests.get(video_url_shotstack, timeout=60).content
            nombre_archivo = f"job-{job.id}-{int(datetime.now(timezone.utc).timestamp())}.mp4"
            url_final = _subir_video_a_storage(video_bytes, nombre_archivo)

            # A propósito NO se crea ningún registro en la tabla "videos" acá.
            # El mp4 queda listo en Storage y visible en "Video Tutoriales";
            # solo pasa a "Administrar Videos" si un admin lo vincula a
            # propósito desde el selector en "Nuevo video" (ver /vincular).
            job.video_url = url_final
            job.estado = "completado"
            job.error_mensaje = None

        except Exception as exc:
            logger.exception("Error procesando video completado del job %s", job.id)
            job.estado = "fallido"
            job.error_mensaje = f"Render completado pero falló el guardado: {exc}"

    elif shotstack_status == "failed":
        job.estado = "fallido"
        job.error_mensaje = error or "Render fallido en Shotstack."

    # Estados intermedios (queued, fetching, rendering, saving) -> no se tocan,
    # el job se queda en 'procesando'.

    db_session.commit()


@router.post("/webhook")
async def shotstack_webhook(request: Request, db_session: Session = Depends(db.get_db)):
    """
    Shotstack no firma sus callbacks por defecto, así que se valida que el
    render_id recibido corresponda a un job propio antes de aceptar la
    actualización. Sin auth.get_current_admin: Shotstack llama a esta URL
    directamente, sin token de usuario.
    """
    body = await request.json()
    logger.info("Webhook Shotstack recibido: %s", body)

    render_id = body.get("id") or body.get("response", {}).get("id")
    shotstack_status = body.get("status") or body.get("response", {}).get("status")
    video_url_shotstack = body.get("url") or body.get("response", {}).get("url")
    error = body.get("error") or body.get("response", {}).get("error")

    if not render_id:
        raise HTTPException(status_code=400, detail="Payload sin render id.")

    job = (
        db_session.query(models.VideoGenerationJob)
        .filter(models.VideoGenerationJob.shotstack_render_id == render_id)
        .first()
    )
    if not job:
        logger.warning("Webhook recibido para render_id desconocido: %s", render_id)
        raise HTTPException(status_code=404, detail="Job no encontrado para este render id.")

    _completar_job(job, shotstack_status, video_url_shotstack, error, db_session)
    return {"ok": True}


# ---------- Consulta de estado ----------

@router.get("/", response_model=list[VideoGenerationOut])
def listar_jobs(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    return (
        db_session.query(models.VideoGenerationJob)
        .order_by(models.VideoGenerationJob.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/disponibles-para-manual", response_model=list[VideoGenerationOut])
def listar_disponibles_para_manual(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    """
    Jobs completados que todavía NO se vincularon a un video del manual.
    Pensado para el selector en "Administrar Videos" -> "Nuevo video".
    Declarada ANTES de GET /{job_id} a propósito: FastAPI matchea rutas en
    el orden en que se declaran, y si esta fuera después, "/disponibles-para-manual"
    intentaría interpretarse como un job_id (numérico) y tiraría 422.
    """
    return (
        db_session.query(models.VideoGenerationJob)
        .filter(models.VideoGenerationJob.estado == "completado")
        .filter(models.VideoGenerationJob.video_id.is_(None))
        .order_by(models.VideoGenerationJob.created_at.desc())
        .all()
    )


@router.get("/{job_id}", response_model=VideoGenerationOut)
def obtener_estado(
    job_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    job = db_session.query(models.VideoGenerationJob).filter(models.VideoGenerationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado.")
    return job


# ---------- Borrar / regenerar ----------

def _eliminar_de_storage(bucket: str, url_publica: str | None) -> None:
    """
    Best-effort: intenta borrar un archivo de Supabase Storage a partir de su
    URL pública. Nunca lanza excepción — si falla, solo queda un archivo
    huérfano en el bucket, lo cual no es grave y no debe frenar el borrado
    del registro en la base de datos.
    """
    if not url_publica:
        return
    marcador = f"/storage/v1/object/public/{bucket}/"
    if marcador not in url_publica:
        return
    path = url_publica.split(marcador, 1)[1]
    try:
        requests.delete(
            f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
            },
            timeout=10,
        )
    except Exception:
        logger.warning("No se pudo borrar de Storage: %s/%s", bucket, path, exc_info=True)


def _eliminar_video_vinculado(job: "models.VideoGenerationJob", db_session: Session) -> None:
    """Borra el registro Video vinculado al job (si existe) y su mp4 en Storage."""
    if not job.video_id:
        return
    video = db_session.query(models.Video).filter(models.Video.id == job.video_id).first()
    if video:
        _eliminar_de_storage(SUPABASE_BUCKET_VIDEOS_GENERADOS, video.url)
        db_session.delete(video)
    job.video_id = None
    job.video_url = None


def _preparar_para_regenerar(job: "models.VideoGenerationJob") -> None:
    """
    Prepara el job para una nueva generación (usado por regenerar/editar):
    - Si el job YA estaba vinculado a un video publicado en "Administrar
      Videos" (job.video_id), ese video NO se toca ni se borra — sigue
      existiendo tal cual para quien lo esté viendo en el manual. El job
      simplemente se desvincula, porque va a apuntar a una versión nueva
      (si querés que el manual muestre la versión nueva, hay que
      volver a vincularla a mano desde "Nuevo video").
    - Si el render anterior NUNCA se vinculó a nada (video_id ya era None),
      se borra su mp4 de Storage antes de generar el nuevo, para no dejar
      archivos huérfanos dando vueltas.
    """
    if job.video_id:
        job.video_id = None
    elif job.video_url:
        _eliminar_de_storage(SUPABASE_BUCKET_VIDEOS_GENERADOS, job.video_url)
    job.video_url = None


@router.delete("/{job_id}")
def eliminar_job(
    job_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    """
    Elimina el job. Si NUNCA se vinculó a un video del manual, también borra
    su mp4 de Storage. Si SÍ estaba vinculado, el video publicado en
    "Administrar Videos" no se toca (queda ahí, manejable normalmente desde
    esa sección) — solo desaparece el job/borrador.
    """
    job = db_session.query(models.VideoGenerationJob).filter(models.VideoGenerationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado.")

    if not job.video_id and job.video_url:
        _eliminar_de_storage(SUPABASE_BUCKET_VIDEOS_GENERADOS, job.video_url)

    db_session.delete(job)
    db_session.commit()
    return {"message": "Video tutorial eliminado correctamente."}


@router.post("/{job_id}/regenerar", response_model=VideoGenerationOut)
def regenerar_job(
    job_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    """
    Vuelve a generar el video de un job existente, reutilizando el mismo
    título/descripción/pasos/puntos ya guardados.
    """
    job = db_session.query(models.VideoGenerationJob).filter(models.VideoGenerationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado.")

    _preparar_para_regenerar(job)
    job.estado = "pendiente"
    job.error_mensaje = None
    job.guion_json = None
    job.shotstack_render_id = None
    db_session.commit()
    db_session.refresh(job)

    _procesar_generacion(job, db_session)
    db_session.refresh(job)

    if job.estado == "fallido":
        raise HTTPException(status_code=502, detail=job.error_mensaje or "No se pudo regenerar el video.")

    return job


@router.put("/{job_id}", response_model=VideoGenerationOut)
def actualizar_job(
    job_id: int,
    datos: VideoGenerationCreate,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    """
    Edita el título/descripción/pasos/puntos de un job existente y lo vuelve
    a generar con la información actualizada (mismo comportamiento que
    regenerar, pero con datos nuevos en vez de reusar los viejos).
    """
    job = db_session.query(models.VideoGenerationJob).filter(models.VideoGenerationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado.")
    if job.estado == "procesando":
        raise HTTPException(status_code=400, detail="No se puede editar un video mientras se está generando. Cancelalo primero.")

    pasos_validos = [p for p in datos.pasos if p.texto.strip()]
    if not pasos_validos:
        raise HTTPException(status_code=400, detail="Agregá al menos un paso de la solución con texto.")

    _preparar_para_regenerar(job)

    job.titulo = datos.titulo
    job.descripcion_inconveniente = datos.descripcion_inconveniente
    job.solucion = "\n".join(f"{i + 1}. {p.texto.strip()}" for i, p in enumerate(pasos_validos))
    job.pasos_json = [p.model_dump() for p in pasos_validos]
    job.puntos_a_considerar = datos.puntos_a_considerar
    job.imagenes = [p.imagen_url for p in pasos_validos if p.imagen_url]
    job.estado = "pendiente"
    job.error_mensaje = None
    job.guion_json = None
    job.shotstack_render_id = None
    db_session.commit()
    db_session.refresh(job)

    _procesar_generacion(job, db_session)
    db_session.refresh(job)

    if job.estado == "fallido":
        raise HTTPException(status_code=502, detail=job.error_mensaje or "No se pudo actualizar el video.")

    return job


@router.post("/{job_id}/vincular/{video_id}", response_model=VideoGenerationOut)
def vincular_a_video(
    job_id: int,
    video_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    """
    Marca un job como vinculado a un registro que ya existe en la tabla
    "videos" (creado normalmente desde "Administrar Videos" -> "Nuevo video",
    eligiendo este job en el selector de "usar un video generado por IA").
    Una vez vinculado, el job deja de aparecer en /disponibles-para-manual.
    """
    job = db_session.query(models.VideoGenerationJob).filter(models.VideoGenerationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado.")
    video = db_session.query(models.Video).filter(models.Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video no encontrado.")

    job.video_id = video.id
    db_session.commit()
    db_session.refresh(job)
    return job


@router.post("/{job_id}/cancelar", response_model=VideoGenerationOut)
def cancelar_job(
    job_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    """
    Deja de esperar el resultado de un render en curso. IMPORTANTE: Shotstack
    no ofrece una forma de abortar un render ya enviado, así que el render
    real sigue corriendo (y consumiendo créditos) del lado de Shotstack; esto
    solo actualiza el estado de nuestro lado para no seguir esperándolo.
    """
    job = db_session.query(models.VideoGenerationJob).filter(models.VideoGenerationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado.")
    if job.estado != "procesando":
        raise HTTPException(status_code=400, detail="Solo se puede cancelar un video que está procesando.")

    job.estado = "cancelado"
    job.error_mensaje = "Cancelado por el usuario."
    db_session.commit()
    db_session.refresh(job)
    return job


@router.post("/{job_id}/reintentar-estado", response_model=VideoGenerationOut)
def reintentar_estado(
    job_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    """Fallback manual: consulta directamente a Shotstack por si el webhook no llegó."""
    job = db_session.query(models.VideoGenerationJob).filter(models.VideoGenerationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado.")
    if not job.shotstack_render_id:
        raise HTTPException(status_code=400, detail="Este job no tiene un render id de Shotstack.")

    estado_shotstack = shotstack_client.consultar_estado_render(job.shotstack_render_id)
    shotstack_status = estado_shotstack.get("status")

    if job.estado != "completado":
        _completar_job(job, shotstack_status, estado_shotstack.get("url"), estado_shotstack.get("error"), db_session)
        db_session.refresh(job)

    return job