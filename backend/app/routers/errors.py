import time
import uuid
from datetime import datetime
from typing import List

import requests
import psycopg2
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session, joinedload

from ..database import models, db
from .. import schemas
from ..config import (
    GEMINI_API_KEY,
    GEMINI_EMBEDDING_MODEL,
    DATABASE_URL,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
)
from . import auth

router = APIRouter(prefix="/errors", tags=["Errores frecuentes"])

EMBED_DIMENSION = 768
GEMINI_EMBED_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_EMBEDDING_MODEL}:embedContent"
)

SUPABASE_STORAGE_BUCKET = "error-evidencias"
EXTENSIONES_PERMITIDAS = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
}
MAX_TAMANO_IMAGEN_BYTES = 5 * 1024 * 1024  # 5 MB


def _generar_embedding_error(texto: str):
    """Genera el embedding del contenido de un error aprobado (mismo patron que rag_query.py)."""
    for intento in range(5):
        respuesta = requests.post(
            GEMINI_EMBED_URL,
            headers={"x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json"},
            json={
                "model": f"models/{GEMINI_EMBEDDING_MODEL}",
                "content": {"parts": [{"text": texto}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": EMBED_DIMENSION,
            },
        )
        if respuesta.status_code == 429:
            time.sleep(2 ** intento)
            continue
        respuesta.raise_for_status()
        return respuesta.json()["embedding"]["values"]

    raise RuntimeError("Se agotaron los reintentos por rate limit de Gemini.")


def _indexar_error(error: models.ErrorReport):
    """Genera el embedding del error y lo guarda en error_chunks para que el RAG lo use."""
    texto = (
        f"{error.titulo}\n\nModulo: {error.modulo}\n\n"
        f"Descripcion del error: {error.descripcion}\n\n"
        f"Causa: {error.causa or 'No especificada'}\n\n"
        f"Solucion: {error.solucion}\n\n"
        f"Procedimiento: {error.procedimiento or ''}"
    )
    embedding = _generar_embedding_error(texto)
    embedding_literal = "[" + ",".join(str(v) for v in embedding) + "]"

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM error_chunks WHERE error_id = %s;", (error.id,))
        cur.execute(
            "INSERT INTO error_chunks (error_id, contenido, embedding) VALUES (%s, %s, %s::vector);",
            (error.id, texto, embedding_literal),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


@router.post(
    "/upload-imagen",
    response_model=schemas.ImagenUploadResponse,
    summary="Subir imagen de evidencia de un error",
    description="Sube una imagen (JPG, JPEG o PNG) a Supabase Storage y devuelve su URL publica, "
                "para asociarla luego al campo imagen_url de un error frecuente. "
                "Requiere privilegio de administrador.",
)
def subir_imagen_evidencia(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_admin),
):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase Storage no esta configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY faltantes).",
        )

    extension = EXTENSIONES_PERMITIDAS.get(file.content_type)
    if not extension:
        raise HTTPException(
            status_code=400,
            detail="Solo se permiten imagenes en formato JPG, JPEG o PNG.",
        )

    contenido = file.file.read()
    if len(contenido) > MAX_TAMANO_IMAGEN_BYTES:
        raise HTTPException(status_code=400, detail="La imagen no debe superar los 5 MB.")

    nombre_archivo = f"{uuid.uuid4().hex}.{extension}"
    url_subida = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{nombre_archivo}"

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

    url_publica = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{nombre_archivo}"
    return {"url": url_publica}


@router.post(
    "",
    response_model=schemas.ErrorReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar error frecuente",
    description="Crea un nuevo error frecuente en estado 'pendiente', a la espera de aprobación. "
                "Requiere privilegio de administrador.",
)
def crear_error(
    data: schemas.ErrorReportCreate,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    if data.tiene_evidencia and not data.imagen_url:
        raise HTTPException(
            status_code=400,
            detail="Debes subir una imagen de evidencia antes de guardar el error.",
        )

    opciones_validas = [o for o in data.diagnostico_opciones if o.pregunta.strip() and o.respuesta.strip()]
    if data.tiene_diagnostico and len(opciones_validas) < 2:
        raise HTTPException(status_code=400, detail="Agrega al menos dos opciones de diagnóstico, cada una con su pregunta y respuesta.")

    payload = data.model_dump(exclude={"diagnostico_opciones"})
    nuevo = models.ErrorReport(**payload, created_by=current_user.id)
    db_session.add(nuevo)
    db_session.flush()

    if data.tiene_diagnostico:
        for indice, opcion in enumerate(opciones_validas):
            db_session.add(models.ErrorDiagnosticoOpcion(
                error_id=nuevo.id,
                pregunta=opcion.pregunta.strip(),
                respuesta=opcion.respuesta.strip(),
                orden=indice,
            ))

    db_session.commit()
    db_session.refresh(nuevo)
    return nuevo


@router.get(
    "",
    response_model=List[schemas.ErrorReportResponse],
    summary="Listar errores frecuentes",
    description="Devuelve todos los errores frecuentes, sin importar su estado.",
)
def listar_errores(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    return (
        db_session.query(models.ErrorReport)
        .options(
            joinedload(models.ErrorReport.creator),
            joinedload(models.ErrorReport.reviewer),
        )
        .order_by(models.ErrorReport.created_at.desc())
        .all()
    )


@router.get(
    "/pendientes",
    response_model=List[schemas.ErrorReportResponse],
    summary="Listar errores pendientes de aprobación",
    description="Devuelve solo los errores en estado 'pendiente'. Requiere privilegio mayor.",
)
def listar_pendientes(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    return (
        db_session.query(models.ErrorReport)
        .options(
            joinedload(models.ErrorReport.creator),
            joinedload(models.ErrorReport.reviewer),
        )
        .filter(models.ErrorReport.estado == "pendiente")
        .order_by(models.ErrorReport.created_at.desc())
        .all()
    )


@router.post(
    "/{error_id}/revisar",
    response_model=schemas.ErrorReportResponse,
    summary="Aprobar o rechazar un error",
    description="Aprueba o rechaza un error pendiente. Si se aprueba, se genera su embedding "
                "y se indexa para que la IA lo use al responder. Requiere privilegio mayor.",
)
def revisar_error(
    error_id: int,
    data: schemas.ErrorReportReview,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    error = db_session.query(models.ErrorReport).filter(models.ErrorReport.id == error_id).first()
    if not error:
        raise HTTPException(status_code=404, detail="Error no encontrado")
    if error.estado != "pendiente":
        raise HTTPException(status_code=400, detail="Este error ya fue revisado")

    error.estado = "aprobado" if data.aprobar else "rechazado"
    error.reviewed_by = current_user.id
    error.reviewed_at = datetime.utcnow()
    db_session.commit()
    db_session.refresh(error)

    if data.aprobar:
        try:
            _indexar_error(error)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"El error fue aprobado pero no se pudo indexar para la IA: {exc}",
            )

    return error


@router.put(
    "/{error_id}",
    response_model=schemas.ErrorReportResponse,
    summary="Editar error frecuente",
    description="Edita los datos de un error existente. Si ya estaba aprobado, se regenera "
                "automaticamente su embedding para que la IA use el contenido actualizado. "
                "Requiere privilegio de administrador.",
)
def editar_error(
    error_id: int,
    data: schemas.ErrorReportUpdate,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    error = db_session.query(models.ErrorReport).filter(models.ErrorReport.id == error_id).first()
    if not error:
        raise HTTPException(status_code=404, detail="Error no encontrado")

    datos = data.model_dump(exclude_unset=True, exclude={"diagnostico_opciones"})

    tiene_evidencia_final = datos.get("tiene_evidencia", error.tiene_evidencia)
    imagen_url_final = datos.get("imagen_url", error.imagen_url)
    if tiene_evidencia_final and not imagen_url_final:
        raise HTTPException(
            status_code=400,
            detail="Debes subir una imagen de evidencia antes de guardar el error.",
        )

    tiene_diagnostico_final = datos.get("tiene_diagnostico", error.tiene_diagnostico)

    for campo, valor in datos.items():
        setattr(error, campo, valor)

    if data.diagnostico_opciones is not None:
        opciones_validas = [o for o in data.diagnostico_opciones if o.pregunta.strip() and o.respuesta.strip()]
        if tiene_diagnostico_final and len(opciones_validas) < 2:
            raise HTTPException(status_code=400, detail="Agrega al menos dos opciones de diagnóstico, cada una con su pregunta y respuesta.")

        db_session.query(models.ErrorDiagnosticoOpcion).filter(
            models.ErrorDiagnosticoOpcion.error_id == error.id
        ).delete()
        for indice, opcion in enumerate(opciones_validas):
            db_session.add(models.ErrorDiagnosticoOpcion(
                error_id=error.id,
                pregunta=opcion.pregunta.strip(),
                respuesta=opcion.respuesta.strip(),
                orden=indice,
            ))

    db_session.commit()
    db_session.refresh(error)

    if error.estado == "aprobado":
        try:
            _indexar_error(error)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"El error se actualizo pero no se pudo re-indexar para la IA: {exc}",
            )

    return error


@router.delete(
    "/{error_id}",
    response_model=schemas.MessageResponse,
    summary="Eliminar error frecuente",
    description="Elimina un error frecuente. Si estaba aprobado, su embedding en error_chunks "
                "se elimina automaticamente (ON DELETE CASCADE). Requiere privilegio de administrador.",
)
def eliminar_error(
    error_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    error = db_session.query(models.ErrorReport).filter(models.ErrorReport.id == error_id).first()
    if not error:
        raise HTTPException(status_code=404, detail="Error no encontrado")

    db_session.delete(error)
    db_session.commit()
    return {"message": "Error eliminado correctamente"}