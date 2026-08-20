import time
import uuid
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
    SUPABASE_SERVICE_KEY,
    SUPABASE_URL,
)
from ..database import db, models
from . import auth

router = APIRouter(prefix="/updates", tags=["Actualizaciones"])

STORAGE_BUCKET = "actualizaciones-pdf"
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
    clean = (value or "").strip()
    if len(clean) < minimum:
        raise HTTPException(status_code=400, detail=f"{label} es obligatorio.")
    return clean


def _validate_applicability(value: str) -> str:
    clean = (value or "").strip().lower()
    if clean not in VALID_APPLICABILITY:
        raise HTTPException(
            status_code=400,
            detail="La aplicabilidad debe ser Honduras, República Dominicana o ambas.",
        )
    return clean


def _ensure_storage_bucket():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase Storage no está configurado.")

    base_url = SUPABASE_URL.rstrip("/")
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
        "Content-Type": "application/json",
    }
    try:
        created = requests.post(
            f"{base_url}/storage/v1/bucket",
            headers=headers,
            json={
                "id": STORAGE_BUCKET,
                "name": STORAGE_BUCKET,
                "public": True,
                "file_size_limit": MAX_PDF_BYTES,
                "allowed_mime_types": ["application/pdf"],
            },
            timeout=20,
        )
    except requests.exceptions.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail="No se pudo conectar con Supabase para crear el almacenamiento de PDF.",
        ) from exc
    response_text = created.text.lower()
    already_exists = created.status_code in (400, 409) and any(
        marker in response_text for marker in ("already exists", "duplicate", "ya existe")
    )
    if created.status_code not in (200, 201) and not already_exists:
        if created.status_code in (401, 403):
            detail = (
                "La clave SUPABASE_SERVICE_KEY configurada en Vercel no tiene permisos "
                "para crear el almacenamiento de PDF. Debe utilizarse la clave service_role."
            )
        else:
            detail = f"No se pudo crear el bucket de PDF en Supabase ({created.status_code})."
        raise HTTPException(status_code=502, detail=detail)


def _upload_pdf(content: bytes) -> tuple[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase Storage no está configurado.")

    base_url = SUPABASE_URL.rstrip("/")
    storage_path = f"{uuid.uuid4().hex}.pdf"

    def upload():
        return requests.post(
            f"{base_url}/storage/v1/object/{STORAGE_BUCKET}/{storage_path}",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "application/pdf",
            },
            data=content,
            timeout=45,
        )

    # Primero intenta usar un bucket que ya exista. Solo intenta crearlo si
    # Supabase indica que no lo encuentra; así también funciona en proyectos
    # donde la clave puede subir objetos pero no administrar buckets.
    try:
        response = upload()
    except requests.exceptions.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail="No se pudo conectar con Supabase para subir el PDF.",
        ) from exc
    if response.status_code in (400, 404) and "bucket" in response.text.lower():
        _ensure_storage_bucket()
        try:
            response = upload()
        except requests.exceptions.RequestException as exc:
            raise HTTPException(
                status_code=502,
                detail="El bucket se preparó, pero no se pudo conectar para subir el PDF.",
            ) from exc

    if response.status_code not in (200, 201):
        if response.status_code in (401, 403):
            detail = (
                "Supabase rechazó la carga del PDF. Verifica que SUPABASE_SERVICE_KEY "
                "en Vercel sea la clave service_role del mismo proyecto."
            )
        else:
            detail = f"No se pudo subir el PDF a Supabase ({response.status_code})."
        raise HTTPException(status_code=502, detail=detail)

    public_url = f"{base_url}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"
    return storage_path, public_url


def _delete_pdf(storage_path: str):
    if not storage_path or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return
    requests.delete(
        f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{STORAGE_BUCKET}/{storage_path}",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
        },
        timeout=20,
    )


def _read_pdf(file: UploadFile) -> tuple[bytes, list[dict]]:
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

    if not any(page["text"] for page in pages):
        raise HTTPException(
            status_code=400,
            detail="El PDF no contiene texto seleccionable para agregarlo al asistente.",
        )
    return content, pages


def _split_pages(pages: list[dict], heading: str) -> list[dict]:
    chunks = []
    for page in pages:
        text = page["text"]
        start = 0
        while start < len(text):
            end = min(start + MAX_CHUNK_CHARS, len(text))
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
            start = max(end - CHUNK_OVERLAP, start + 1)
    return chunks[:80]


def _embed_documents(texts: list[str]) -> list[list[float]]:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY no está configurada.")
    embeddings = []
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
        cursor.execute("DELETE FROM update_chunks WHERE update_id = %s", (document.id,))
        for chunk, embedding in zip(chunks, embeddings):
            vector = "[" + ",".join(str(value) for value in embedding) + "]"
            cursor.execute(
                """
                INSERT INTO update_chunks
                    (update_id, contenido, pagina_inicio, pagina_fin, embedding)
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
    response = requests.get(document.archivo_url, timeout=45)
    response.raise_for_status()
    pseudo_file = UploadFile(filename=document.archivo_nombre, file=__import__("io").BytesIO(response.content))
    _, pages = _read_pdf(pseudo_file)
    return pages


@router.get("", response_model=List[schemas.UpdateDocumentResponse])
def list_updates(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    return (
        db_session.query(models.UpdateDocument)
        .options(joinedload(models.UpdateDocument.creator))
        .order_by(models.UpdateDocument.created_at.desc())
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
    is_active: bool = Form(True),
    file: UploadFile = File(...),
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
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
        storage_path=storage_path,
        is_active=is_active,
        created_by=current_user.id,
    )
    db_session.add(document)
    db_session.commit()
    db_session.refresh(document)
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
    document = db_session.query(models.UpdateDocument).filter(models.UpdateDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Actualización no encontrada.")
    content, pages = _read_pdf(file)
    new_path, new_url = _upload_pdf(content)
    old_path = document.storage_path
    old_url = document.archivo_url
    old_name = document.archivo_nombre
    document.storage_path = new_path
    document.archivo_url = new_url
    document.archivo_nombre = file.filename or "actualizacion.pdf"
    db_session.commit()
    db_session.refresh(document)
    try:
        _index_document(document, pages)
    except Exception as exc:
        document.storage_path, document.archivo_url, document.archivo_nombre = old_path, old_url, old_name
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
    document = db_session.query(models.UpdateDocument).filter(models.UpdateDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Actualización no encontrada.")
    storage_path = document.storage_path
    db_session.delete(document)
    db_session.commit()
    _delete_pdf(storage_path)
    return {"message": "Actualización eliminada correctamente."}
