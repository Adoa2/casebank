"""
build_vector_db.py

Construye la base vectorial en Supabase (Postgres + pgvector) a partir de
manual_structure.json, usando embeddings generados con la API de Gemini
(modelo principal gemini-embedding-001, con fallback automatico a
gemini-embedding-2 cuando se agota la cuota diaria del primero), truncado
a 768 dimensiones.

Uso:
    python build_vector_db.py

Si el script se interrumpe (por ejemplo, por rate limit del tier gratis de
Gemini), se puede volver a correr tal cual: usa un checkpoint local
(embeddings_checkpoint.json) para no volver a pedir embeddings ya generados.
El checkpoint tambien recuerda que modelo genero cada embedding.

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

GEMINI_EMBED_MODEL_PRIMARIO = "gemini-embedding-001"
GEMINI_EMBED_MODEL_FALLBACK = "gemini-embedding-2"

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
    """Quita marcadores visuales y conserva únicamente párrafos semánticos."""
    limpio = IMG_MARKER_PATTERN.sub("\n\n", texto or "")
    parrafos = []
    for bloque in re.split(r"\n\s*\n", limpio):
        parrafo = re.sub(r"\s+", " ", bloque).strip()
        if parrafo:
            parrafos.append(parrafo)
    return "\n\n".join(parrafos)


def cargar_manual(path):
    """Lee el manual_structure.json generado"""
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
            corte = texto.rfind("\n\n", inicio, fin)
            if corte == -1 or corte <= inicio:
                corte = texto.rfind(". ", inicio, fin)
                corte = corte + 1 if corte > inicio else fin
        else:
            corte = len(texto)

        fragmento = texto[inicio:corte].strip()
        if fragmento:
            chunks.append(fragmento)

        if corte >= len(texto):
            break

        inicio_solapado = max(inicio + 1, corte - overlap)
        limite_parrafo = texto.find("\n\n", inicio_solapado, corte)
        inicio = limite_parrafo + 2 if limite_parrafo != -1 else inicio_solapado

    return chunks


def construir_chunks(secciones):
    """
    Convierte cada seccion del manual (Capitulo, subcapitulo, etc.) en uno
    o mas chunks listos para generar embeddings. Primero se intenta
    dividir la seccion en sub-bloques con titulo propio (ver
    dividir_en_subsecciones); luego cada sub-bloque, si sigue siendo largo,
    se corta por tamano igual que antes.
    """
    chunks = []
    for seccion in secciones:
        contenido = (seccion.get("contenido") or "").strip()
        if not contenido:
            continue
        contenido = limpiar_marcadores_imagen(contenido)
        if not contenido:
            continue

        titulo_base = seccion.get("titulo", "")
        subsecciones = dividir_en_subsecciones(contenido)

        for sub_idx, (subtitulo, texto_sub) in enumerate(subsecciones):
            if subtitulo:
                titulo_chunk = f"{titulo_base} — {subtitulo}" if titulo_base else subtitulo
            else:
                titulo_chunk = titulo_base

            partes = dividir_en_chunks(texto_sub)

            for idx, parte in enumerate(partes):
                texto_embedding = f"{titulo_chunk}\n\n{parte}" if titulo_chunk else parte

                chunks.append({
                    "chunk_key": f"{seccion['id']}-{sub_idx}-{idx}",
                    "texto": texto_embedding,
                    "titulo": titulo_chunk,
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
            datos = json.load(f)
        # Compatibilidad con checkpoints viejos, donde el valor era directamente la lista de floats del embedding.
        migrado = {}
        for clave, valor in datos.items():
            if isinstance(valor, dict) and "embedding" in valor:
                migrado[clave] = valor
            else:
                migrado[clave] = {
                    "embedding": valor,
                    "modelo": GEMINI_EMBED_MODEL_PRIMARIO,
                }
        return migrado
    return {}


def guardar_checkpoint(checkpoint):
    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f)


def construir_request_body(chunks_lote, modelo):
    requests_body = []
    for chunk in chunks_lote:
        item = {
            "model": f"models/{modelo}",
            "content": {"parts": [{"text": chunk["texto"]}]},
            "taskType": TASK_TYPE,
            "outputDimensionality": EMBED_DIMENSION,
        }
        if chunk["titulo"]:
            item["title"] = chunk["titulo"][:200]
        requests_body.append(item)
    return requests_body


def embed_lote(chunks_lote, modelo):
    """
    Llama a batchEmbedContents de Gemini para un lote de chunks, usando el
    modelo indicado. Reintenta con backoff exponencial si hay error 429
    (rate limit) o 5xx. Si se agotan los reintentos, devuelve None en vez
    de levantar una excepcion, para que el llamador pueda decidir si pasa
    al modelo de respaldo.
    """
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{modelo}:batchEmbedContents"
    )
    requests_body = construir_request_body(chunks_lote, modelo)

    for intento in range(MAX_REINTENTOS):
        respuesta = requests.post(
            url,
            headers={
                "x-goog-api-key": GEMINI_API_KEY,
                "Content-Type": "application/json",
            },
            json={"requests": requests_body},
        )

        if respuesta.status_code in (429, 500, 503):
            espera = 2 ** intento
            print(f"  [{modelo}] {respuesta.status_code}, esperando {espera}s antes de reintentar...")
            if respuesta.status_code == 429:
                print(f"  Detalle del error: {respuesta.text[:500]}")
            time.sleep(espera)
            continue

        respuesta.raise_for_status()
        datos = respuesta.json()
        return [e["values"] for e in datos["embeddings"]]

    print(f"  [{modelo}] se agotaron los reintentos, se considera cuota agotada para este modelo.")
    return None


def obtener_embeddings(chunks, batch_size=EMBED_BATCH_SIZE):
    """
    Genera embeddings en lotes llamando a la API de Gemini. Empieza con el
    modelo principal; si este agota su cuota diaria (falla incluso despues
    de los reintentos), pasa automaticamente al modelo de respaldo para el
    resto de los chunks pendientes.

    Usa un checkpoint local (embeddings_checkpoint.json) para no volver a
    pedir embeddings ya generados si el script se corta y se vuelve a correr,
    y recuerda con que modelo se genero cada uno.
    """
    checkpoint = cargar_checkpoint()
    total = len(chunks)
    pendientes = [c for c in chunks if c["chunk_key"] not in checkpoint]

    if len(pendientes) < total:
        print(f"  {total - len(pendientes)} chunks ya estaban en el checkpoint, se omiten.")

    modelo_actual = GEMINI_EMBED_MODEL_PRIMARIO
    modelos_usados = set(v["modelo"] for v in checkpoint.values())

    i = 0
    while i < len(pendientes):
        lote = pendientes[i:i + batch_size]
        embeddings_lote = embed_lote(lote, modelo_actual)

        if embeddings_lote is None:
            if modelo_actual == GEMINI_EMBED_MODEL_PRIMARIO:
                print(f"  Cuota de {GEMINI_EMBED_MODEL_PRIMARIO} agotada. "
                      f"Cambiando a {GEMINI_EMBED_MODEL_FALLBACK} para lo que falta...")
                modelo_actual = GEMINI_EMBED_MODEL_FALLBACK
                continue  # reintenta el mismo lote con el modelo de respaldo
            else:
                raise RuntimeError(
                    "Se agotaron los reintentos tambien con el modelo de respaldo "
                    f"({GEMINI_EMBED_MODEL_FALLBACK}). El progreso hasta ahora quedo "
                    "guardado en el checkpoint; volve a correr el script mas tarde "
                    "para continuar donde quedo."
                )

        for chunk, embedding in zip(lote, embeddings_lote):
            checkpoint[chunk["chunk_key"]] = {
                "embedding": embedding,
                "modelo": modelo_actual,
            }
        guardar_checkpoint(checkpoint)
        modelos_usados.add(modelo_actual)

        print(f"  Embeddings generados: {len(checkpoint)}/{total} (modelo: {modelo_actual})")

        i += batch_size
        if i < len(pendientes):
            time.sleep(PAUSA_ENTRE_LOTES_SEG)

    if len(modelos_usados) > 1:
        print(
            "\n  ADVERTENCIA: los embeddings se generaron con mas de un modelo "
            f"({', '.join(sorted(modelos_usados))}). Mezclar modelos distintos en la "
            "misma tabla puede degradar la calidad del RAG porque cada modelo usa un "
            "espacio vectorial diferente. Se recomienda, cuando haya cuota disponible, "
            "borrar el checkpoint y volver a correr el script con un solo modelo."
        )

    return [checkpoint[c["chunk_key"]]["embedding"] for c in chunks]


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

VERBOS_SUBENCABEZADO = [
    "Agregar", "Modificar", "Eliminar", "Visualizar", "Ingresar",
    "Imprimir", "Buscar", "Consultar", "Registrar", "Generar",
    "Cambiar", "Cargar", "Descargar", "Actualizar", "Configurar",
    "Activar", "Desactivar", "Habilitar", "Deshabilitar", "Revisar",
    "Enviar", "Aprobar", "Rechazar", "Cancelar", "Asignar",
    "Control de", "Definir", "Descripción de",
]

_patron_verbos = "|".join(re.escape(v) for v in VERBOS_SUBENCABEZADO)
SUBENCABEZADO_REGEX = re.compile(
    rf"(?:^|\n\n)(?:[#\d][#\d\.\)]{{0,3}}\s+)?((?:{_patron_verbos})[^\n:]{{0,90}}?):\s+",
    re.MULTILINE,
)

_NUMERO_SUELTO_INICIAL_REGEX = re.compile(r"^\s*[#\d][#\d]{0,2}\s+")

def dividir_en_subsecciones(contenido):
    """
    Detecta sub-encabezados dentro de una seccion larga del manual, del
    tipo "Agregar un plan de pago: Para agregar..." o "Visualizar
    transacciones: Para poder...", que en el PDF original marcan un
    sub-procedimiento distinto dentro de una misma seccion del indice
    (TOC). Sin esto, secciones largas (ej. "Apertura y modificacion de
    cuenta de prestamo", 27 paginas con ~20 sub-procedimientos) quedan
    todas bajo el mismo titulo generico al trocearse por tamano, lo que
    impide que la busqueda semantica distinga "agregar un prestamo" de
    "agregar una cuota".

    Devuelve una lista de (subtitulo, texto). subtitulo es None para el
    primer tramo (texto antes del primer sub-encabezado detectado,
    tipicamente la introduccion o los pasos iniciales de la seccion). Si
    no se detecta ningun sub-encabezado, devuelve [(None, contenido)] sin
    modificar el comportamiento anterior.
    """
    matches = list(SUBENCABEZADO_REGEX.finditer(contenido))
    if not matches:
        return [(None, contenido)]

    tramos = []

    intro = contenido[:matches[0].start()].strip()
    if intro:
        tramos.append((None, intro))

    for idx, m in enumerate(matches):
        subtitulo = m.group(1).strip()
        inicio_texto = m.end()
        fin_texto = matches[idx + 1].start() if idx + 1 < len(matches) else len(contenido)
        texto = contenido[inicio_texto:fin_texto].strip()
        texto = _NUMERO_SUELTO_INICIAL_REGEX.sub("", texto).strip()
        if texto:
            tramos.append((subtitulo, texto))

    return tramos

if __name__ == "__main__":
    main()


