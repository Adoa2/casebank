# Gestión de documentos de actualización: carga, indexado en RAG y reemplazo de PDF en el almacenamiento de archivos.
import io
import time
from typing import List

import fitz
import psycopg2
import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from .. import schemas
from ..config import (
    DATABASE_URL,
    GEMINI_API_KEY,
    GEMINI_EMBEDDING_MODEL,
)
from ..database import db, models
from ..services import almacenamiento
from . import auth

router = APIRouter(prefix="/updates", tags=["Actualizaciones"])

STORAGE_BUCKET = almacenamiento.BUCKET_ACTUALIZACIONES
MAX_PDF_BYTES = 15 * 1024 * 1024
MAX_CHUNK_CHARS = 1800
CHUNK_OVERLAP = 220
EMBED_DIMENSION = 768
EMBED_BATCH_SIZE = 20
VALID_APPLICABILITY = {"honduras", "dominicana", "ambas"}
GEMINI_BATCH_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_EMBEDDING_MODEL}:batchEmbedContents"
)


def _validate_text(value: str, label: str, minimum: int = 2) -> str:
    """Valida que un campo de texto no esté vacío ni sea demasiado corto."""
    clean = (value or "").strip()
    if len(clean) < minimum:
        raise HTTPException(status_code=400, detail=f"{label} es obligatorio.")
    return clean


def _validate_applicability(value: str) -> str:
    """Valida que la aplicabilidad sea uno de los valores permitidos."""
    clean = (value or "").strip().lower()
    if clean not in VALID_APPLICABILITY:
        raise HTTPException(
            status_code=400,
            detail="La aplicabilidad debe ser Honduras, República Dominicana o ambas.",
        )
    return clean


def _upload_pdf(content: bytes) -> tuple[str, str]:
    """
    Sube el PDF al almacenamiento. Devuelve (ruta_almacenamiento, url_publica).
    En modo supabase, si el bucket no existe se crea y se reintenta (como antes).
    """
    storage_path = almacenamiento.generar_nombre("pdf")
    try:
        public_url = almacenamiento.subir(STORAGE_BUCKET, storage_path, content, "application/pdf", timeout=45)
    except almacenamiento.ErrorAlmacenamiento as exc:
        detalle = str(exc) if exc.estado_http < 502 else f"No se pudo subir el PDF: {exc}"
        raise HTTPException(status_code=exc.estado_http, detail=detalle) from exc
    return storage_path, public_url


def _delete_pdf(storage_path: str):
    """Elimina un PDF del almacenamiento. Best-effort: si falla solo se registra un aviso."""
    almacenamiento.borrar_sin_fallar(STORAGE_BUCKET, storage_path)


def _read_pdf(file: UploadFile) -> tuple[bytes, list[dict]]:
    """Lee y valida el PDF subido. Devuelve (bytes, lista de páginas con texto extraído)."""
    name = file.filename or "actualizacion.pdf"
    if not name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF.")
    content = file.file.read(MAX_PDF_BYTES + 1)
    if not content or len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="El PDF debe pesar como máximo 15 MB.")
    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="El archivo seleccionado no es un PDF válido.")

    try:
        document = fitz.open(stream=content, filetype="pdf")
        pages = [
            {"page": number + 1, "text": page.get_text("text").strip()}
            for number, page in enumerate(document)
        ]
        document.close()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="No se pudo leer el PDF.") from exc

    # Rechazar PDFs escaneados (sin capa de texto) que no sirven al RAG
    if not any(page["text"] for page in pages):
        raise HTTPException(
            status_code=400,
            detail="El PDF no contiene texto seleccionable para agregarlo al asistente.",
        )
    return content, pages


def _split_pages(pages: list[dict], heading: str) -> list[dict]:
    """
    Divide el texto del PDF en chunks de máximo MAX_CHUNK_CHARS con solapamiento.
    Antepone el encabezado del documento a cada chunk para enriquecer el contexto del RAG.
    """
    chunks = []
    for page in pages:
        text = page["text"]
        start = 0
        while start < len(text):
            end = min(start + MAX_CHUNK_CHARS, len(text))
            # Preferir corte en salto de línea para no partir frases
            if end < len(text):
                break_at = text.rfind("\n", start, end)
                if break_at > start + 600:
                    end = break_at
            part = text[start:end].strip()
            if part:
                chunks.append({
                    "text": f"{heading}\n\n{part}",
                    "page_start": page["page"],
                    "page_end": page["page"],
                })
            if end >= len(text):
                break
            # Solapamiento: retroceder CHUNK_OVERLAP caracteres para mantener contexto entre chunks
            start = max(end - CHUNK_OVERLAP, start + 1)
    return chunks[:80]


def _embed_documents(texts: list[str]) -> list[list[float]]:
    """
    Genera embeddings de 768 dimensiones en lotes via Gemini batchEmbedContents.
    Reintenta con backoff ante rate limit (429).
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY no está configurada.")
    embeddings = []
    # Enviar en lotes de EMBED_BATCH_SIZE para no exceder el límite por request de Gemini
    for offset in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[offset:offset + EMBED_BATCH_SIZE]
        payload = {
            "requests": [{
                "model": f"models/{GEMINI_EMBEDDING_MODEL}",
                "content": {"parts": [{"text": text}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": EMBED_DIMENSION,
            } for text in batch]
        }
        # Backoff exponencial ante rate limit de Gemini (máx. 5 intentos)
        for attempt in range(5):
            response = requests.post(
                GEMINI_BATCH_URL,
                headers={"x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json"},
                json=payload,
                timeout=60,
            )
            if response.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            embeddings.extend(item["values"] for item in response.json()["embeddings"])
            break
        else:
            raise RuntimeError("Se agotaron los reintentos al indexar el PDF.")
    return embeddings


def _index_document(document: models.UpdateDocument, pages: list[dict]):
    """
    Trocea el PDF del documento, genera sus embeddings y los inserta en fragmentos_actualizacion.
    Hace TRUNCATE + reinsert del documento para mantener el índice actualizado ante ediciones.
    """
    heading = (
        f"Actualización: {document.titulo}\n"
        f"Descripción: {document.descripcion}\n"
        f"Palabras clave: {document.palabras_clave}\n"
        f"Capítulo: {document.capitulo or 'No especificado'}\n"
        f"Sección: {document.seccion or 'No especificada'}"
    )
    chunks = _split_pages(pages, heading)
    embeddings = _embed_documents([chunk["text"] for chunk in chunks])
    connection = psycopg2.connect(DATABASE_URL)
    cursor = connection.cursor()
    try:
        # DELETE + INSERT es más simple que UPSERT cuando el número de chunks puede cambiar
        cursor.execute("DELETE FROM fragmentos_actualizacion WHERE actualizacion_id = %s", (document.id,))
        for chunk, embedding in zip(chunks, embeddings):
            vector = "[" + ",".join(str(value) for value in embedding) + "]"
            cursor.execute(
                """
                INSERT INTO fragmentos_actualizacion
                    (actualizacion_id, contenido, pagina_inicio, pagina_fin, embedding)
                VALUES (%s, %s, %s, %s, %s::vector)
                """,
                (document.id, chunk["text"], chunk["page_start"], chunk["page_end"], vector),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


def _load_pages_from_storage(document: models.UpdateDocument) -> list[dict]:
    """
    Lee el PDF del almacenamiento por su ruta_almacenamiento (no descarga URLs
    arbitrarias) y extrae su texto, para re-indexar tras un cambio de metadatos.
    """
    content = almacenamiento.leer(STORAGE_BUCKET, document.ruta_almacenamiento)
    pseudo_file = UploadFile(filename=document.archivo_nombre, file=io.BytesIO(content))
    _, pages = _read_pdf(pseudo_file)
    return pages


@router.get("", response_model=List[schemas.UpdateDocumentResponse])
def list_updates(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    """Devuelve todos los documentos de actualización, del más reciente al más antiguo."""
    return (
        db_session.query(models.UpdateDocument)
        .options(joinedload(models.UpdateDocument.creator))
        .order_by(models.UpdateDocument.creado_en.desc())
        .all()
    )


@router.post("", response_model=schemas.UpdateDocumentResponse, status_code=status.HTTP_201_CREATED)
def create_update(
    titulo: str = Form(...),
    descripcion: str = Form(...),
    palabras_clave: str = Form(...),
    aplicabilidad: str = Form(...),
    seccion_id: int | None = Form(None),
    capitulo: str = Form(...),
    seccion: str = Form(...),
    activo: bool = Form(True),
    file: UploadFile = File(...),
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    """
    Recibe el formulario multipart, sube el PDF al almacenamiento, persiste el registro
    en la BD y lo indexa en fragmentos_actualizacion. Si el indexado falla, deshace la subida.
    """
    title = _validate_text(titulo, "El título", 3)
    description = _validate_text(descripcion, "La descripción", 5)
    keywords = _validate_text(palabras_clave, "Las palabras clave")
    applies_to = _validate_applicability(aplicabilidad)
    content, pages = _read_pdf(file)
    storage_path, public_url = _upload_pdf(content)
    document = models.UpdateDocument(
        titulo=title,
        descripcion=description,
        palabras_clave=keywords,
        aplicabilidad=applies_to,
        seccion_id=seccion_id,
        capitulo=_validate_text(capitulo, "El capítulo", 1),
        seccion=_validate_text(seccion, "La sección", 1),
        subseccion=None,
        archivo_url=public_url,
        archivo_nombre=file.filename or "actualizacion.pdf",
        ruta_almacenamiento=storage_path,
        activo=activo,
        creado_por=current_user.id,
    )
    db_session.add(document)
    db_session.commit()
    db_session.refresh(document)
    # Si el indexado falla, deshacer el registro y el archivo para no dejar huérfanos
    try:
        _index_document(document, pages)
    except Exception as exc:
        db_session.delete(document)
        db_session.commit()
        _delete_pdf(storage_path)
        raise HTTPException(status_code=502, detail="El PDF se recibió, pero no pudo indexarse.") from exc
    db_session.refresh(document)
    return document


@router.put("/{document_id}", response_model=schemas.UpdateDocumentResponse)
def update_metadata(
    document_id: int,
    data: schemas.UpdateDocumentUpdate,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    """
    Actualiza los metadatos del documento. Si cambia algún campo del encabezado de chunk
    (título, descripción, palabras clave, capítulo, sección), descarga el PDF de Storage
    y re-indexa los fragmentos para mantener el RAG actualizado.
    """
    document = db_session.query(models.UpdateDocument).filter(models.UpdateDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Actualización no encontrada.")
    changes = data.model_dump(exclude_unset=True)
    if "titulo" in changes:
        changes["titulo"] = _validate_text(changes["titulo"], "El título", 3)
    if "descripcion" in changes:
        changes["descripcion"] = _validate_text(changes["descripcion"], "La descripción", 5)
    if "palabras_clave" in changes:
        changes["palabras_clave"] = _validate_text(changes["palabras_clave"], "Las palabras clave")
    if "aplicabilidad" in changes:
        changes["aplicabilidad"] = _validate_applicability(changes["aplicabilidad"])
    # Re-indexar si cambió algún campo que forma parte del encabezado de cada chunk
    needs_reindex = bool({
        "titulo", "descripcion", "palabras_clave", "capitulo", "seccion", "subseccion"
    } & changes.keys())
    for key, value in changes.items():
        setattr(document, key, value)
    db_session.commit()
    db_session.refresh(document)
    if needs_reindex:
        try:
            _index_document(document, _load_pages_from_storage(document))
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Los datos se guardaron, pero no pudo renovarse el índice.") from exc
    return document


@router.post("/{document_id}/pdf", response_model=schemas.UpdateDocumentResponse)
def replace_pdf(
    document_id: int,
    file: UploadFile = File(...),
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    """
    Reemplaza el PDF de un documento existente. Sube el nuevo archivo, re-indexa y
    borra el archivo anterior del almacenamiento. Si el indexado falla, restaura los datos originales.
    """
    document = db_session.query(models.UpdateDocument).filter(models.UpdateDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Actualización no encontrada.")
    content, pages = _read_pdf(file)
    new_path, new_url = _upload_pdf(content)
    old_path = document.ruta_almacenamiento
    old_url = document.archivo_url
    old_name = document.archivo_nombre
    document.ruta_almacenamiento = new_path
    document.archivo_url = new_url
    document.archivo_nombre = file.filename or "actualizacion.pdf"
    db_session.commit()
    db_session.refresh(document)
    # Restaurar referencias antiguas si el indexado del nuevo PDF falla
    try:
        _index_document(document, pages)
    except Exception as exc:
        document.ruta_almacenamiento, document.archivo_url, document.archivo_nombre = old_path, old_url, old_name
        db_session.commit()
        _delete_pdf(new_path)
        raise HTTPException(status_code=502, detail="No se pudo indexar el nuevo PDF.") from exc
    _delete_pdf(old_path)
    return document


@router.delete("/{document_id}", response_model=schemas.MessageResponse)
def delete_update(
    document_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    """Elimina el documento y su PDF del almacenamiento; los fragmentos se borran por ON DELETE CASCADE."""
    document = db_session.query(models.UpdateDocument).filter(models.UpdateDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Actualización no encontrada.")
    storage_path = document.ruta_almacenamiento
    db_session.delete(document)
    db_session.commit()
    _delete_pdf(storage_path)
    return {"mensaje": "Actualización eliminada correctamente."}
