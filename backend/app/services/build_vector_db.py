"""
build_vector_db.py

Construye la base vectorial en Supabase (Postgres + pgvector) a partir de
manual_structure.json, usando embeddings generados con la API de Gemini
(modelo gemini-embedding-001, truncado a 768 dimensiones).

Uso:
    python build_vector_db.py

Si el script se interrumpe (por ejemplo, por rate limit del tier gratis de
Gemini), se puede volver a correr tal cual: usa un checkpoint local
(embeddings_checkpoint.json) para no volver a pedir embeddings ya generados.

Requisitos previos:
    - Variable de entorno GEMINI_API_KEY (ver app/config.py / .env)
    - Variable de entorno DATABASE_URL apuntando a Supabase Postgres
    - Extension pgvector habilitada y tabla manual_chunks creada
    - pip install psycopg2-binary requests python-dotenv

Este script debe colocarse en app/services/, junto a pdf_processor.py,
ya que asume que manual_structure.json vive en ../../data/manual_structure.json
"""

import json
import os
import re
import time
import requests
import psycopg2
from psycopg2.extras import execute_values, Json
from dotenv import load_dotenv

load_dotenv()

# --- Configuracion ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

GEMINI_EMBED_MODEL = "gemini-embedding-001"
GEMINI_EMBED_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_EMBED_MODEL}:batchEmbedContents"
)
EMBED_DIMENSION = 768
TASK_TYPE = "RETRIEVAL_DOCUMENT"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(BASE_DIR, "..", "..", "data", "manual_structure.json")
CHECKPOINT_PATH = os.path.join(BASE_DIR, "embeddings_checkpoint.json")

# Tamano maximo de cada chunk de texto (en caracteres) antes de dividirlo
CHUNK_MAX_CHARS = 1500
CHUNK_OVERLAP = 200
EMBED_BATCH_SIZE = 20
PAUSA_ENTRE_LOTES_SEG = 5
MAX_REINTENTOS = 6

IMG_MARKER_PATTERN = re.compile(r"\[IMG:[^\]]+\]")


def limpiar_marcadores_imagen(texto):
    """Quita los marcadores [IMG:...] y colapsa las lineas en blanco que quedan."""
    limpio = IMG_MARKER_PATTERN.sub("", texto)
    limpio = re.sub(r"\n{3,}", "\n\n", limpio)
    return limpio.strip()


def cargar_manual(path):
    """Lee el manual_structure.json generado en la Fase 3."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def dividir_en_chunks(texto, max_chars=CHUNK_MAX_CHARS, overlap=CHUNK_OVERLAP):
    """
    Divide un texto largo en fragmentos mas pequenos, con solapamiento,
    intentando cortar en saltos de linea para no partir instrucciones a la mitad.
    Si el texto ya es corto, lo devuelve como un solo chunk.
    """
    texto = texto.strip()
    if len(texto) <= max_chars:
        return [texto]

    chunks = []
    inicio = 0
    while inicio < len(texto):
        fin = inicio + max_chars
        if fin < len(texto):
            corte = texto.rfind("\n", inicio, fin)
            if corte == -1 or corte <= inicio:
                corte = fin
        else:
            corte = len(texto)

        fragmento = texto[inicio:corte].strip()
        if fragmento:
            chunks.append(fragmento)

        if corte >= len(texto):
            break

        inicio = max(corte - overlap, inicio + 1)

    return chunks


def construir_chunks(secciones):
    """
    Convierte cada seccion del manual (Capitulo, subcapitulo, etc.) en uno
    o mas chunks listos para generar embeddings. Se ignoran las secciones
    sin contenido real (por ejemplo, encabezados de capitulo vacios).
    """
    chunks = []
    for seccion in secciones:
        contenido = (seccion.get("contenido") or "").strip()
        if not contenido:
            continue
        contenido = limpiar_marcadores_imagen(contenido)
        if not contenido:
            continue

        titulo = seccion.get("titulo", "")
        partes = dividir_en_chunks(contenido)

        for idx, parte in enumerate(partes):
            texto_embedding = f"{titulo}\n\n{parte}" if titulo else parte

            chunks.append({
                "chunk_key": f"{seccion['id']}-{idx}",  # solo para el checkpoint
                "texto": texto_embedding,
                "titulo": titulo,
                "id_seccion": seccion["id"],
                "nivel": seccion.get("nivel", 0),
                "pagina_inicio": seccion.get("pagina_inicio", 0),
                "pagina_fin": seccion.get("pagina_fin", 0),
                "imagenes": seccion.get("imagenes", []),
            })

    return chunks


def cargar_checkpoint():
    if os.path.exists(CHECKPOINT_PATH):
        with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def guardar_checkpoint(checkpoint):
    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f)


def embed_lote(chunks_lote):
    """
    Llama a batchEmbedContents de Gemini para un lote de chunks.
    Reintenta con backoff exponencial si hay error 429 (rate limit) o 5xx.
    """
    requests_body = []
    for chunk in chunks_lote:
        item = {
            "model": f"models/{GEMINI_EMBED_MODEL}",
            "content": {"parts": [{"text": chunk["texto"]}]},
            "taskType": TASK_TYPE,
            "outputDimensionality": EMBED_DIMENSION,
        }
        if chunk["titulo"]:
            item["title"] = chunk["titulo"][:200]
        requests_body.append(item)

    for intento in range(MAX_REINTENTOS):
        respuesta = requests.post(
            GEMINI_EMBED_URL,
            headers={
                "x-goog-api-key": GEMINI_API_KEY,
                "Content-Type": "application/json",
            },
            json={"requests": requests_body},
        )

        if respuesta.status_code in (429, 500, 503):
            espera = 2 ** intento
            print(f"  {respuesta.status_code}, esperando {espera}s antes de reintentar...")
            if respuesta.status_code == 429:
                print(f"  Detalle del error: {respuesta.text[:500]}")
            time.sleep(espera)
            continue

        respuesta.raise_for_status()
        datos = respuesta.json()
        return [e["values"] for e in datos["embeddings"]]

    raise RuntimeError(
        "Se agotaron los reintentos por rate limit de Gemini. "
        "El progreso hasta ahora quedo guardado en el checkpoint; "
        "volve a correr el script para continuar donde quedo."
    )


def obtener_embeddings(chunks, batch_size=EMBED_BATCH_SIZE):
    """
    Genera embeddings en lotes llamando a la API de Gemini.
    Usa un checkpoint local (embeddings_checkpoint.json) para no volver a
    pedir embeddings ya generados si el script se corta y se vuelve a correr.
    """
    checkpoint = cargar_checkpoint()
    total = len(chunks)
    pendientes = [c for c in chunks if c["chunk_key"] not in checkpoint]

    if len(pendientes) < total:
        print(f"  {total - len(pendientes)} chunks ya estaban en el checkpoint, se omiten.")

    for i in range(0, len(pendientes), batch_size):
        lote = pendientes[i:i + batch_size]
        embeddings_lote = embed_lote(lote)

        for chunk, embedding in zip(lote, embeddings_lote):
            checkpoint[chunk["chunk_key"]] = embedding
        guardar_checkpoint(checkpoint)

        print(f"  Embeddings generados: {len(checkpoint)}/{total}")

        if i + batch_size < len(pendientes):
            time.sleep(PAUSA_ENTRE_LOTES_SEG)

    return [checkpoint[c["chunk_key"]] for c in chunks]


def guardar_en_postgres(chunks, embeddings):
    """Trunca manual_chunks y vuelve a insertar todo desde cero."""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        cur.execute("TRUNCATE TABLE manual_chunks RESTART IDENTITY;")

        filas = []
        for chunk, embedding in zip(chunks, embeddings):
            # pgvector espera el literal como texto: [0.1,0.2,...]
            embedding_literal = "[" + ",".join(str(v) for v in embedding) + "]"
            filas.append((
                chunk["id_seccion"],
                chunk["titulo"],
                chunk["nivel"],
                chunk["pagina_inicio"],
                chunk["pagina_fin"],
                chunk["texto"],
                Json(chunk["imagenes"]),
                embedding_literal,
            ))

        execute_values(
            cur,
            """
            INSERT INTO manual_chunks
                (seccion_id, titulo, nivel, pagina_inicio, pagina_fin, contenido, imagenes, embedding)
            VALUES %s
            """,
            filas,
            template="(%s, %s, %s, %s, %s, %s, %s, %s::vector)",
        )

        conn.commit()
    finally:
        cur.close()
        conn.close()


def main():
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY no esta configurada (revisa el .env).")
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL no esta configurada (revisa el .env).")

    print(f"Cargando manual desde: {JSON_PATH}")
    secciones = cargar_manual(JSON_PATH)
    print(f"Secciones cargadas: {len(secciones)}")

    chunks = construir_chunks(secciones)
    print(f"Chunks generados: {len(chunks)}")

    print("Generando embeddings con Gemini (esto puede tardar varios minutos)...")
    embeddings = obtener_embeddings(chunks)

    print("Guardando en Supabase (Postgres + pgvector)...")
    guardar_en_postgres(chunks, embeddings)

    if os.path.exists(CHECKPOINT_PATH):
        os.remove(CHECKPOINT_PATH)

    print(f"\nListo. {len(chunks)} chunks indexados en la tabla 'manual_chunks'.")
    print("Ya puedes probar consultas con: python rag_query.py \"tu pregunta\"")


if __name__ == "__main__":
    main()