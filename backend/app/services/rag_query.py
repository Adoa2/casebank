"""
rag_query.py

Realiza busqueda semantica sobre el manual (indexado por build_vector_db.py
en Supabase/pgvector) y genera una respuesta en lenguaje natural usando
la API de Gemini (modelo gemini-2.5-flash).

Uso desde terminal:
    python rag_query.py "como ingreso un estado financiero de un afiliado?"

Uso desde otro modulo (por ejemplo, un endpoint de FastAPI):
    from rag_query import answer_question
    resultado = answer_question("pregunta del usuario")

Requisitos previos:
    - Variables de entorno GEMINI_API_KEY y DATABASE_URL (ver .env)
    - build_vector_db.py ya debe haberse ejecutado al menos una vez
"""

import sys
import os
import time
import requests
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# --- Configuracion ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

GEMINI_EMBED_MODEL = "gemini-embedding-001"
# Debe coincidir con GEMINI_GENERATION_MODEL en app/config.py
GEMINI_GENERATION_MODEL = "gemini-flash-lite-latest"

GEMINI_EMBED_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_EMBED_MODEL}:embedContent"
)
GEMINI_GENERATE_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_GENERATION_MODEL}:generateContent"
)

EMBED_DIMENSION = 768  # debe coincidir con el usado en build_vector_db.py
MAX_REINTENTOS = 5

N_RESULTS = 8          # candidatos iniciales a recuperar de Postgres
DISTANCE_FACTOR = 1.3  # un chunk se descarta si su distancia supera 1.3x la del mejor resultado
MAX_CHUNKS_USADOS = 4  # tope de chunks que realmente se usan como contexto/fuentes


def _post_con_reintentos(url, body):
    """POST con reintentos por rate limit (429), usado tanto para embed como para generar."""
    for intento in range(MAX_REINTENTOS):
        respuesta = requests.post(
            url,
            headers={
                "x-goog-api-key": GEMINI_API_KEY,
                "Content-Type": "application/json",
            },
            json=body,
        )
        if respuesta.status_code == 429:
            espera = 2 ** intento
            print(f"  Rate limit alcanzado, esperando {espera}s...")
            time.sleep(espera)
            continue

        respuesta.raise_for_status()
        return respuesta.json()

    raise RuntimeError("Se agotaron los reintentos por rate limit de Gemini.")


def embed_query(pregunta):
    """Genera el embedding de la pregunta del usuario usando Gemini (RETRIEVAL_QUERY)."""
    datos = _post_con_reintentos(GEMINI_EMBED_URL, {
        "model": f"models/{GEMINI_EMBED_MODEL}",
        "content": {"parts": [{"text": pregunta}]},
        "taskType": "RETRIEVAL_QUERY",
        "outputDimensionality": EMBED_DIMENSION,
    })
    return datos["embedding"]["values"]


def search_relevant_chunks(pregunta, n_results=N_RESULTS):
    """Busca en Postgres/pgvector los chunks del manual mas relevantes para la pregunta."""
    query_embedding = embed_query(pregunta)
    embedding_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT seccion_id, titulo, pagina_inicio, pagina_fin, contenido, imagenes,
               embedding <=> %s::vector AS distance
        FROM manual_chunks
        ORDER BY distance
        LIMIT %s;
        """,
        (embedding_literal, n_results),
    )
    filas = cur.fetchall()
    cur.close()
    conn.close()

    chunks = []
    for seccion_id, titulo, pagina_inicio, pagina_fin, contenido, imagenes, distance in filas:
        chunks.append({
            "documento": contenido,
            "metadata": {
                "seccion_id": seccion_id,
                "titulo": titulo,
                "pagina_inicio": pagina_inicio,
                "pagina_fin": pagina_fin,
                "imagenes": imagenes or [],
            },
            "distance": float(distance),
        })

    return chunks


def filtrar_por_relevancia(chunks, factor=DISTANCE_FACTOR, max_chunks=MAX_CHUNKS_USADOS):
    """
    Se queda solo con los chunks realmente cercanos a la mejor coincidencia,
    para no arrastrar secciones poco relacionadas (y sus imagenes) solo porque
    la busqueda siempre devuelve N resultados aunque no sean relevantes.
    """
    if not chunks:
        return chunks

    chunks_ordenados = sorted(chunks, key=lambda c: c["distance"])
    mejor_distancia = chunks_ordenados[0]["distance"]
    limite = mejor_distancia * factor if mejor_distancia > 0 else 0

    relevantes = [c for c in chunks_ordenados if c["distance"] <= limite]
    if not relevantes:
        relevantes = chunks_ordenados[:1]

    return relevantes[:max_chunks]


def build_prompt(pregunta, chunks):
    """Arma el prompt para el LLM combinando la pregunta con el contexto recuperado."""
    contexto = "\n\n---\n\n".join(c["documento"] for c in chunks)

    prompt = f"""Eres un asistente que responde preguntas sobre el Manual de Usuario del Sistema CaseBank.
Usa UNICAMENTE la siguiente informacion extraida del manual para responder. Si la
respuesta no se encuentra en el contexto, indica claramente que no cuentas con esa
informacion en el manual, sin inventar pasos.

Contexto del manual:
{contexto}

Pregunta del usuario: {pregunta}

Responde en espanol, de forma clara y en pasos numerados cuando aplique:"""

    return prompt


def call_gemini_generate(prompt):
    """Envia el prompt al modelo de generacion y devuelve el texto de respuesta."""
    datos = _post_con_reintentos(GEMINI_GENERATE_URL, {
        "contents": [{"parts": [{"text": prompt}]}],
    })

    candidatos = datos.get("candidates") or []
    if not candidatos:
        return "No se pudo generar una respuesta (el modelo no devolvio candidatos)."

    partes = candidatos[0].get("content", {}).get("parts", [])
    if not partes:
        return "No se pudo generar una respuesta (respuesta vacia del modelo)."

    return partes[0].get("text", "")


def answer_question(question):
    """
    Funcion principal del RAG: busca contexto relevante, genera la respuesta
    y arma la lista de fuentes (seccion_id + titulo + pagina) e imagenes
    relacionadas.

    Devuelve un diccionario con las llaves: respuesta, fuentes, imagenes.
    Esta funcion ya queda lista para ser importada directamente en un
    endpoint de FastAPI (por ejemplo /api/chat).
    """
    chunks = search_relevant_chunks(question)

    if not chunks:
        return {
            "respuesta": "No se encontro informacion relevante en el manual para esta pregunta.",
            "fuentes": [],
            "imagenes": [],
        }

    chunks = filtrar_por_relevancia(chunks)

    prompt = build_prompt(question, chunks)
    respuesta = call_gemini_generate(prompt)

    fuentes = [
        {
            "seccion_id": c["metadata"]["seccion_id"],
            "titulo": c["metadata"]["titulo"],
            "pagina": c["metadata"]["pagina_inicio"],
        }
        for c in chunks
    ]

    imagenes = []
    for c in chunks:
        imagenes.extend(c["metadata"].get("imagenes") or [])

    return {
        "respuesta": respuesta,
        "fuentes": fuentes,
        "imagenes": list(dict.fromkeys(imagenes)),  # sin duplicados, conserva el orden
    }


if __name__ == "__main__":
    pregunta = " ".join(sys.argv[1:]) or "como ingreso un estado financiero de un afiliado?"
    resultado = answer_question(pregunta)

    print(f"\nPregunta: {pregunta}\n")
    print(f"Respuesta:\n{resultado['respuesta']}\n")
    print("Fuentes:")
    for f in resultado["fuentes"]:
        print(f"  - [{f['seccion_id']}] {f['titulo']} (pag. {f['pagina']})")
    if resultado["imagenes"]:
        print("\nImagenes relacionadas:")
        for img in resultado["imagenes"]:
            print(f"  - {img}")