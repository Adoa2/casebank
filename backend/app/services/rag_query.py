"""
rag_query.py

Realiza busqueda semantica sobre el manual (indexado por build_vector_db.py
en Supabase/pgvector) y sobre los errores frecuentes aprobados, y genera una
respuesta en lenguaje natural usando la API de Gemini.

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
import re
import json
import time
import requests
import psycopg2
from concurrent.futures import ThreadPoolExecutor
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

N_RESULTS = 8
DISTANCE_FACTOR = 1.3
MAX_CHUNKS_USADOS = 5
MAX_DISTANCE_ABSOLUTE = 0.55

MAX_DISTANCE_ERROR = 0.35

MAX_INTENTOS_CONFIRMACION_EVIDENCIA = 2

DEBUG_RAG = True

FRASE_SIN_INFORMACION = "No cuento con esa información en el manual."
SUPPORT_TICKET_URL = "https://soporte.sinteghn.com/clientes/login.php"

GREETING_BASES = [
    r"hola+",
    r"(muy )?buen[oa]s?( d[ií]as?| tardes?| noches?)?",
    r"hey",
    r"hi",
    r"(que|qu[ée]) tal",
    r"como (estas|est[aá]s|andas)",
    r"gracias",
    r"muchas gracias",
    r"(ok|okay|vale|listo|entendido)",
    r"(adios|adi[oó]s|chao|hasta luego|nos vemos)",
    r"(muy )?bien(,)?\s*(y\s*(tu|usted|vos))?",
    r"todo bien(,)?\s*(y\s*(tu|usted|vos))?",
    r"(mas|m[aá]s) o menos",
    r"por aqui( todo bien)?",
    r"(y\s*)?(tu|usted|vos)( que tal| como estas| c[oó]mo est[aá]s)?",
]
_SUFIJO_NOMBRE = r"(\s+casey(\s+bot)?)?"

_GREETING_REGEX = re.compile(
    r"^(?:" + "|".join(GREETING_BASES) + r")" + _SUFIJO_NOMBRE + r"[!?.,¡¿\s]*$",
    re.IGNORECASE,
)


ABOUT_ASSISTANT_PATTERNS = [
    r"(que|qu[ée]) (haces|puedes hacer|sabes hacer|funciones tienes)(\s+(tu|vos|casey))?",
    r"quien(es)? (eres|sos)(\s+(tu|vos|casey))?",
    r"que (eres|sos)(\s+(tu|vos|casey))?",
    r"cual(es)? (es|son) tu(s)? funci[oó]n(es)?",
    r"(en|de) que (me puedes|podes|puedes) ayudar",
    r"como (me puedes|podes|puedes) ayudar(me)?",
    r"para que (sirves|te uso|eres|te puedo usar|sos)",
    r"que tipo de (preguntas|cosas|temas) (puedo hacerte|me puedes ayudar|puedo preguntarte)",
    r"que es casey",
    r"h[aá]blame de ti",
    r"cu[eé]ntame (sobre ti|de ti|sobre vos|de vos)",
    r"que (informacion|informaci[oó]n) (tienes|manejas|tenes)",
]

_ABOUT_ASSISTANT_REGEX = re.compile(
    r"(?:" + "|".join(ABOUT_ASSISTANT_PATTERNS) + r")",
    re.IGNORECASE,
)


_REPETIDO_REGEX = re.compile(r"(.)\1{3,}")  # el mismo caracter 4+ veces seguidas
_VOCALES = set("aeiouáéíóúü")


def es_mensaje_sin_sentido(texto):
    """
    Deteccion rapida (sin llamar a Gemini) de mensajes que claramente no son
    una pregunta real: muy cortos, sin vocales (tipico de apretar teclas al
    azar, ej. "svvvvvvvvvvvvvvvvv"), o dominados por un mismo caracter
    repetido. Sirve para evitar correr todo el pipeline (analisis + busqueda
    doble + generacion, ~20s) en mensajes que de entrada no tienen sentido.
    """
    normalizado = texto.strip().lower()
    if len(normalizado) < 3:
        return True

    solo_letras = re.sub(r"[^a-záéíóúñü]", "", normalizado)
    if not solo_letras:
        return True

    vocales = sum(1 for c in solo_letras if c in _VOCALES)
    if len(solo_letras) >= 5 and vocales == 0:
        return True

    if _REPETIDO_REGEX.search(normalizado) and len(set(solo_letras)) <= 3:
        return True

    return False


def es_pregunta_sobre_el_asistente(texto):
    """
    True si el mensaje pregunta sobre el asistente mismo (que hace, cuales
    son sus funciones, quien es, etc.) en vez de sobre un tema puntual del
    manual. Estas preguntas se responden directo, describiendo las
    capacidades reales de Casey, sin pasar por la busqueda semantica.
    """
    normalizado = texto.strip().lower()
    return bool(_ABOUT_ASSISTANT_REGEX.search(normalizado))

SINONIMOS_DOMINIO = {
    "catalogo": ["definición", "definicion"],
    "catálogo": ["definición", "definicion"],
    "catalogo de cuentas": ["definición de cuentas", "definicion de cuentas"],
    "plan de cuentas": ["definición de cuentas", "definicion de cuentas"],
    "crear cuenta": ["definir cuenta", "definición de cuentas"],
    "afiliado": ["socio", "asociado"],
    "socio": ["afiliado", "asociado"],
    "prestamo": ["credito", "préstamo"],
    "préstamo": ["credito", "prestamo"],
    "credito": ["prestamo", "préstamo"],
    "borrar": ["eliminar"],
    "eliminar": ["borrar"],
    "modificar": ["editar", "actualizar"],
    "editar": ["modificar", "actualizar"],
}


def _debug(mensaje):
    if DEBUG_RAG:
        print(f"[DEBUG RAG] {mensaje}")


def es_saludo_o_cortesia(texto):
    """
    True si el mensaje es un saludo, agradecimiento o despedida simple, sin
    contenido tecnico real. Se usa para evitar la busqueda vectorial (y el
    riesgo de arrastrar fuentes irrelevantes) en mensajes que no son
    preguntas sobre el manual.
    """
    normalizado = texto.strip().lower()
    return bool(_GREETING_REGEX.match(normalizado))


REQUEST_TIMEOUT_SEGUNDOS = 20
TIMEOUT_BEST_EFFORT_SEGUNDOS = 8
REINTENTOS_BEST_EFFORT = 2


def _post_con_reintentos(url, body, max_reintentos=MAX_REINTENTOS, timeout=REQUEST_TIMEOUT_SEGUNDOS):
    """
    POST con reintentos, usado tanto para embed como para generar. Reintenta
    ante:
      - Rate limit (HTTP 429), con backoff exponencial.
      - Timeout o error de conexion: sin un timeout explicito, una conexion
        que se cuelga (algo mas frecuente en entornos serverless como
        Vercel que en un entorno local) puede dejar la llamada esperando
        indefinidamente sin loguear nada. Con el timeout, ese escenario
        ahora falla rapido y reintenta (o termina en un error claro) en vez
        de colgarse.

    max_reintentos y timeout son ajustables por llamada: las llamadas
    criticas (ej. la generacion final de la respuesta) usan los valores por
    defecto, mas persistentes. Las llamadas "best-effort" (ej. el analisis
    de correccion/sinonimos, que ya tiene un fallback gracioso si falla) se
    llaman con valores mas bajos, para que ante una demora de red no
    arrastren toda la respuesta del usuario innecesariamente.
    """
    ultimo_error = None
    for intento in range(max_reintentos):
        try:
            respuesta = requests.post(
                url,
                headers={
                    "x-goog-api-key": GEMINI_API_KEY,
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=timeout,
            )
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            ultimo_error = e
            espera = 2 ** intento
            print(f"  Timeout/error de conexion con Gemini ({type(e).__name__}), reintentando en {espera}s...")
            time.sleep(espera)
            continue

        if respuesta.status_code == 429:
            espera = 2 ** intento
            print(f"  Rate limit alcanzado, esperando {espera}s...")
            time.sleep(espera)
            continue

        if respuesta.status_code >= 400:
            _debug(f"HTTP {respuesta.status_code} de Gemini: {respuesta.text[:500]}")

        respuesta.raise_for_status()
        return respuesta.json()

    raise RuntimeError(
        f"Se agotaron los reintentos hacia Gemini (rate limit o timeout de red). "
        f"Ultimo error: {ultimo_error}"
    )


def analizar_pregunta(pregunta):
    """
    Una sola llamada a Gemini Flash Lite (modelo de generacion, no de
    embeddings) que hace dos cosas a la vez para no duplicar costos:

    1. Detecta si el mensaje tiene errores ortograficos o de tipeo reales
       (ej. "cmo agreg un usuARIO") y, de ser asi, devuelve la version
       corregida. Si el mensaje esta bien escrito pero usa palabras
       distintas a las del manual (sinonimos), eso NO cuenta como error y
       "correccion" queda en None.
    2. Genera hasta 5 terminos clave / sinonimos tecnicos relacionados con
       el vocabulario de un manual bancario/cooperativo, para reforzar la
       busqueda semantica sin depender solo del diccionario fijo.

    Devuelve {"correccion": str | None, "terminos_clave": list[str]}.
    Si algo falla (red, JSON invalido, etc.), devuelve valores vacios y el
    flujo normal continua sin este enriquecimiento.
    """
    prompt_analisis = f"""Analiza el siguiente mensaje de un usuario, escrito para un asistente
de un sistema bancario/financiero cooperativo llamado CaseBank.

Mensaje: "{pregunta}"

Responde UNICAMENTE con un objeto JSON valido, sin texto adicional ni markdown,
con esta forma exacta:

{{"correccion": "...", "terminos_clave": ["...", "..."]}}

Reglas para "correccion":
- Si el mensaje tiene errores ortograficos, de tipeo, letras faltantes o
  palabras mal escritas (ej. "cmo agreg un usuARIO" -> "como agrego un
  usuario"), pon aqui la version corregida arreglando SOLO la
  ortografia/tipeo, sin cambiar el significado, sin agregar palabras nuevas
  ni parafrasear.
- Si el mensaje ya esta bien escrito (aunque sea informal, corto, o use
  palabras distintas a las del manual), pon aqui exactamente null.
- NUNCA marques como error ortografico el uso de una palabra valida pero
  distinta (ej. "catalogo" en vez de "definicion" NO es un error ortografico,
  es un sinonimo).
- NUNCA marques como error ortografico la simple falta de tildes/acentos
  (ej. "amortizacion" en vez de "amortización", o "como" en vez de "cómo").
  Eso es muy comun al escribir rapido y NO amerita el aviso de correccion.
  Solo corrige errores de tipeo reales: letras faltantes, de mas, cambiadas
  de lugar, o palabras mal escritas (ej. "cmo" -> "como", "usuARIO" ->
  "usuario", "ccon" -> "con").

Reglas para "terminos_clave":
- Lista de 0 a 5 palabras o frases clave, en espanol, que ayuden a encontrar
  informacion relacionada en un manual de un sistema financiero cooperativo
  (cuentas, afiliados/socios, prestamos/creditos, contabilidad, tesoreria,
  reportes, usuarios, permisos, etc). Incluye sinonimos tecnicos relevantes.
- Si el mensaje no tiene relacion con el sistema (saludo, charla casual),
  deja la lista vacia.

Responde solo el JSON."""

    try:
        datos = _post_con_reintentos(
            GEMINI_GENERATE_URL,
            {
                "contents": [{"parts": [{"text": prompt_analisis}]}],
                "generationConfig": {"response_mime_type": "application/json"},
            },
            max_reintentos=REINTENTOS_BEST_EFFORT,
            timeout=TIMEOUT_BEST_EFFORT_SEGUNDOS,
        )

        candidatos = datos.get("candidates") or []
        if not candidatos:
            _debug("analizar_pregunta: Gemini no devolvio candidatos")
            return {"correccion": None, "terminos_clave": []}

        partes = candidatos[0].get("content", {}).get("parts", [])
        if not partes:
            _debug("analizar_pregunta: candidato sin parts (posible respuesta bloqueada)")
            _debug(f"candidato completo: {candidatos[0]}")
            return {"correccion": None, "terminos_clave": []}

        texto_json = partes[0].get("text", "").strip()
        _debug(f"analizar_pregunta: JSON crudo devuelto -> {texto_json!r}")

        resultado = json.loads(texto_json)

        correccion = resultado.get("correccion")
        if not isinstance(correccion, str) or not correccion.strip() or correccion.strip().lower() == "null":
            correccion = None
        else:
            correccion = correccion.strip()
            # Si el modelo "corrige" pero el resultado es identico (ignorando mayusculas/espacios), no es una correccion real.
            if correccion.lower() == pregunta.strip().lower():
                correccion = None

        terminos = resultado.get("terminos_clave") or []
        if not isinstance(terminos, list):
            terminos = []
        terminos = [str(t).strip() for t in terminos if str(t).strip()]

        _debug(f"analizar_pregunta: correccion={correccion!r} terminos_clave={terminos!r}")

        return {"correccion": correccion, "terminos_clave": terminos}
    except Exception as e:
        _debug(f"analizar_pregunta: EXCEPCION {type(e).__name__}: {e}")
        return {"correccion": None, "terminos_clave": []}


def _sinonimos_fijos(texto):
    """Extras del diccionario fijo (respaldo gratuito) segun el texto dado."""
    normalizado = texto.lower()
    extras = []
    for termino, sinonimos in SINONIMOS_DOMINIO.items():
        if termino in normalizado:
            extras.extend(sinonimos)
    return extras


def embed_query(pregunta, max_reintentos=MAX_REINTENTOS, timeout=REQUEST_TIMEOUT_SEGUNDOS):
    """Genera el embedding de la pregunta del usuario usando Gemini (RETRIEVAL_QUERY)."""
    datos = _post_con_reintentos(
        GEMINI_EMBED_URL,
        {
            "model": f"models/{GEMINI_EMBED_MODEL}",
            "content": {"parts": [{"text": pregunta}]},
            "taskType": "RETRIEVAL_QUERY",
            "outputDimensionality": EMBED_DIMENSION,
        },
        max_reintentos=max_reintentos,
        timeout=timeout,
    )
    return datos["embedding"]["values"]


def search_relevant_chunks(pregunta, n_results=N_RESULTS, max_reintentos=MAX_REINTENTOS, timeout=REQUEST_TIMEOUT_SEGUNDOS):
    """Busca en Postgres/pgvector los chunks del manual y los errores aprobados mas relevantes."""
    _debug(f"search_relevant_chunks: texto enviado a embed_query -> {pregunta!r}")

    query_embedding = embed_query(pregunta, max_reintentos=max_reintentos, timeout=timeout)
    embedding_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT 'manual' AS origen, seccion_id, titulo, pagina_inicio, pagina_fin, contenido, imagenes,
               FALSE AS requiere_ticket, FALSE AS tiene_evidencia, NULL::text AS imagen_url,
               embedding <=> %s::vector AS distance,
               ctid::text AS row_id
        FROM manual_chunks
        UNION ALL
        SELECT 'error' AS origen, ec.error_id::text AS seccion_id, er.titulo AS titulo, NULL::integer AS pagina_inicio,
               NULL::integer AS pagina_fin, ec.contenido, NULL::jsonb AS imagenes,
               er.requiere_ticket, er.tiene_evidencia, er.imagen_url,
               ec.embedding <=> %s::vector AS distance,
               ec.ctid::text AS row_id
        FROM error_chunks ec
        JOIN error_reports er ON er.id = ec.error_id
        ORDER BY distance
        LIMIT %s;
        """,
        (embedding_literal, embedding_literal, n_results),
    )
    filas = cur.fetchall()
    cur.close()
    conn.close()

    chunks = []
    for origen, seccion_id, titulo, pagina_inicio, pagina_fin, contenido, imagenes, requiere_ticket, tiene_evidencia, imagen_url, distance, row_id in filas:
        chunks.append({
            "documento": contenido,
            "metadata": {
                "origen": origen,
                "seccion_id": seccion_id,
                "titulo": titulo,
                "pagina_inicio": pagina_inicio,
                "pagina_fin": pagina_fin,
                "imagenes": imagenes or [],
                "requiere_ticket": bool(requiere_ticket),
                "tiene_evidencia": bool(tiene_evidencia),
                "imagen_url": imagen_url,
                "row_id": row_id,
            },
            "distance": float(distance),
        })

    _debug(
        "search_relevant_chunks: resultados crudos -> "
        + str([(c["metadata"]["origen"], c["metadata"]["seccion_id"], c["metadata"]["titulo"], round(c["distance"], 4)) for c in chunks])
    )

    return chunks


def _obtener_chunk_error(error_id):
    """
    Recupera directamente (sin busqueda vectorial) el contenido y metadata de
    un error puntual por su id. Se usa durante el flujo de confirmacion con
    evidencia, una vez que ya se identifico cual error se quiere usar (ya sea
    porque el usuario confirmo que es el suyo, o porque se va a probar como
    siguiente candidato).
    """
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT ec.contenido, er.titulo, er.requiere_ticket, er.tiene_evidencia,
                   er.imagen_url, ec.ctid::text
            FROM error_chunks ec
            JOIN error_reports er ON er.id = ec.error_id
            WHERE ec.error_id = %s
            LIMIT 1;
            """,
            (error_id,),
        )
        fila = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    if not fila:
        return None

    contenido, titulo, requiere_ticket, tiene_evidencia, imagen_url, row_id = fila
    return {
        "documento": contenido,
        "metadata": {
            "origen": "error",
            "seccion_id": str(error_id),
            "titulo": titulo,
            "pagina_inicio": None,
            "pagina_fin": None,
            "imagenes": [],
            "requiere_ticket": bool(requiere_ticket),
            "tiene_evidencia": bool(tiene_evidencia),
            "imagen_url": imagen_url,
            "row_id": row_id,
        },
        "distance": 0.0,
    }


def _fusionar_chunks(*listas_chunks):
    """
    Combina varias listas de chunks (por ejemplo, una busqueda con la
    pregunta tal cual y otra con terminos clave expandidos) eliminando
    duplicados por (origen, seccion_id) y quedandose con la menor distancia
    encontrada para cada uno en cualquiera de las listas. Asi se aprovechan
    ambas senales de busqueda sin que una misma seccion aparezca repetida.
    """
    mejores = {}
    for lista in listas_chunks:
        for c in lista:
            clave = (c["metadata"]["origen"], c["metadata"]["row_id"])
            actual = mejores.get(clave)
            if actual is None or c["distance"] < actual["distance"]:
                mejores[clave] = c
    return sorted(mejores.values(), key=lambda c: c["distance"])


BOOST_SINONIMO_TITULO = 0.05


def _aplicar_boost_sinonimos(chunks, pregunta):
    """
    Re-rankea los chunks usando el diccionario fijo de sinonimos de dominio
    (SINONIMOS_DOMINIO) como señal determinística, independiente de que tan
    bien (o mal) haya distinguido el embedding entre secciones parecidas.

    Muchas secciones del manual comparten un mismo parrafo de navegacion
    generico al inicio ("... debera entrar primero a Administracion en la
    pantalla principal del sistema"), lo que hace que el embedding las
    acerque entre si aunque traten temas distintos. Si el titulo de un chunk
    contiene un sinonimo conocido de un termino presente en la pregunta (ej.
    pregunta con "catalogo de cuentas" y titulo con "definicion"), se le
    resta un poco de distancia para que compita mejor en el ranking, en vez
    de depender unicamente de la cercania vectorial.
    """
    normalizado = pregunta.lower()
    terminos_relevantes = set()
    for termino, sinonimos in SINONIMOS_DOMINIO.items():
        if termino in normalizado:
            terminos_relevantes.add(termino.lower())
            terminos_relevantes.update(s.lower() for s in sinonimos)

    if not terminos_relevantes:
        return chunks

    ajustados = []
    for c in chunks:
        titulo = (c["metadata"].get("titulo") or "").lower()
        distance = c["distance"]
        if titulo and any(t in titulo for t in terminos_relevantes):
            distance = max(0.0, distance - BOOST_SINONIMO_TITULO)
        ajustados.append({**c, "distance": distance})

    ajustados.sort(key=lambda c: c["distance"])
    return ajustados


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

    resultado = relevantes[:max_chunks]
    _debug(
        f"filtrar_por_relevancia: mejor_distancia={mejor_distancia:.4f} limite={limite:.4f} -> "
        + str([(c["metadata"]["seccion_id"], round(c["distance"], 4)) for c in resultado])
    )
    return resultado


def _fuentes_unicas(chunks_citados, chunks_disponibles=None):
    """
    Arma la lista de fuentes citadas a partir de los chunks que el modelo
    declaro haber usado realmente (chunks_citados, via FUENTES_USADAS).

    El rango de paginas de cada seccion (pagina_inicio - pagina_fin) se
    calcula tomando el minimo y el maximo entre TODOS los fragmentos
    disponibles de esa seccion (chunks_disponibles), no solo el fragmento
    puntual que el modelo cito para responder. Esto es necesario porque una
    seccion larga se puede partir en varios chunks al indexar (ej. paginas
    762-763 en un fragmento y 764-767 en otro), y cada fila de la base solo
    conoce el sub-rango de paginas que cubre su propio texto; el rango real
    de la seccion completa solo se puede reconstruir combinando todos los
    fragmentos que se recuperaron de ella.

    Si no se pasa chunks_disponibles, se usan los mismos chunks_citados
    (comportamiento anterior, por compatibilidad).
    """
    disponibles = chunks_disponibles if chunks_disponibles is not None else chunks_citados

    rangos = {}
    for c in disponibles:
        meta = c["metadata"]
        if meta["origen"] == "error":
            continue

        clave = meta["seccion_id"]
        actual = rangos.setdefault(clave, {"pagina_inicio": None, "pagina_fin": None})

        if meta["pagina_inicio"] is not None:
            if actual["pagina_inicio"] is None or meta["pagina_inicio"] < actual["pagina_inicio"]:
                actual["pagina_inicio"] = meta["pagina_inicio"]
        if meta["pagina_fin"] is not None:
            if actual["pagina_fin"] is None or meta["pagina_fin"] > actual["pagina_fin"]:
                actual["pagina_fin"] = meta["pagina_fin"]

    vistas = set()
    fuentes = []
    for c in chunks_citados:
        meta = c["metadata"]
        if meta["origen"] == "error":
            continue  # los errores frecuentes aportan contenido, pero no se citan como fuente

        clave = meta["seccion_id"]
        if clave in vistas:
            continue
        vistas.add(clave)

        rango = rangos.get(clave, {})

        fuentes.append({
            "seccion_id": clave,
            "titulo": meta["titulo"],
            "pagina": rango.get("pagina_inicio", meta["pagina_inicio"]),
            "pagina_fin": rango.get("pagina_fin", meta["pagina_fin"]),
        })

    return fuentes


RESPUESTA_SOBRE_ASISTENTE = (
    "Soy Casey, el asistente virtual de CaseBank. Te oriento con base en el "
    "Manual de Usuario del sistema, explico paso a paso los distintos "
    "procedimientos y te ayudo a interpretar mensajes de error frecuentes. "
    "En cada respuesta incluyo la sección y página del manual en la que me "
    "baso, y puedes consultarme en lenguaje natural, sin necesidad de "
    "conocer términos técnicos."
)


def build_prompt(pregunta, chunks, incluir_aviso_ticket, terminos_clave=None, omitir_saludo=False):
    """Arma el prompt para el LLM combinando la pregunta con el contexto recuperado."""
    if not chunks:
        return f"""Eres Casey, el asistente virtual de CaseBank. Tu tono es calido, cercano
y servicial, como el de un companero de trabajo.

No se encontro ningun contenido del manual ni de soluciones registradas
relacionado con este mensaje.

Si el mensaje es un saludo, agradecimiento, despedida o charla casual (no una
pregunta real sobre el sistema), respondele de forma breve, calida y natural.

Si en cambio es una pregunta real sobre el uso del sistema CaseBank pero no
hay informacion disponible para responderla, responde UNICAMENTE con esta
frase exacta, sin agregar nada mas: "{FRASE_SIN_INFORMACION}"

Mensaje del usuario: {pregunta}

Responde en espanol:"""

    bloques = [f"[FUENTE {i}]\n{c['documento']}" for i, c in enumerate(chunks, start=1)]
    contexto = "\n\n---\n\n".join(bloques)

    aviso_sinonimos = ""
    if terminos_clave:
        lista_terminos = ", ".join(terminos_clave)
        aviso_sinonimos = f"""

IMPORTANTE sobre vocabulario: el usuario pudo haber usado palabras distintas
a las que aparecen textualmente en el manual (por ejemplo "catalogo de
cuentas" en vez de "definicion de cuentas"). Estos terminos se consideraron
equivalentes o relacionados al preparar el contexto: {lista_terminos}. Si el
contexto responde a la intencion de la pregunta usando estas variantes o
sinonimos, trata esa informacion como valida y responde con ella; NO
respondas que no tienes informacion solo porque el termino exacto que uso el
usuario no aparece literalmente en el contexto."""

    aviso_citas = """

Cada bloque de contexto esta etiquetado como [FUENTE N]. Al terminar tu
respuesta para el usuario, agrega una linea nueva y separada con exactamente
este formato: "FUENTES_USADAS: " seguido de los numeros de las fuentes que
realmente usaste para construir tu respuesta, separados por comas (ejemplo:
FUENTES_USADAS: 1,3). Usa SOLO los numeros de las fuentes cuyo contenido
efectivamente aparece reflejado en tu respuesta; no incluyas una fuente solo
porque estaba disponible si no la usaste. Si no llegaste a usar ninguna
fuente en particular, escribe "FUENTES_USADAS: ninguna". No menciones las
etiquetas [FUENTE N] dentro del texto de tu respuesta al usuario, son solo
una referencia interna; la linea final "FUENTES_USADAS:" si debe incluirse
siempre."""

    aviso_saludo = ""
    if omitir_saludo:
        aviso_saludo = """

IMPORTANTE: justo antes de tu respuesta, el usuario ya vio un aviso indicando
que se interpreto su pregunta con la ortografia corregida (algo como 'Si
quisiste decir "..."'). Por lo tanto, NO comiences tu respuesta con un saludo
como "¡Hola!", "¡Con gusto!" u otra frase de apertura; ve directo a explicar
la respuesta, ya que el saludo ahi resulta repetitivo e innecesario."""

    aviso_ticket = ""
    if incluir_aviso_ticket:
        aviso_ticket = f"""

IMPORTANTE: El contexto menciona abrir un ticket, contactar a soporte, o un
enlace al sistema de tickets. NO lo menciones tu mismo ni lo incluyas como
parte de tus pasos numerados. El sistema agrega ese aviso por separado, de
forma automatica, al final de la respuesta. Si el unico paso de la solucion
es "abrir un ticket", igual explica brevemente la causa del problema, pero
omite esa instruccion de tus pasos."""

    prompt = f"""Eres Casey, el asistente virtual de CaseBank. Respondes preguntas sobre el uso
del sistema con base en el Manual de Usuario y en soluciones registradas por soporte.
Tu tono es calido, cercano y servicial, como el de un companero de trabajo que
explica algo con gusto, nunca como un documento tecnico o un formulario.

Formato: cuando menciones el nombre exacto de un menu, boton, pantalla u opcion
del sistema (los que en el contexto aparecen entre comillas, ej. "Administración",
"Menú de Contabilidad", "Definición de cuentas"), escribelo en **negrita markdown**
ademas de las comillas, por ejemplo: **"Definición de cuentas"**. Esto ayuda a que
el usuario distinga rapidamente que elementos debe buscar en la pantalla.

IMPORTANTE sobre listas: el chat donde se muestra tu respuesta NO renderiza
vinetas de markdown. Por lo tanto:
- Para pasos secuenciales, usa SIEMPRE numeracion "1.", "2.", "3." (esto si se
  ve bien en el chat).
- NUNCA uses asterisco (*) ni guion (-) al inicio de linea como vineta de
  lista; si necesitas presentar varias opciones o casos dentro de una misma
  respuesta (por ejemplo, "para agregar una cuenta..." / "para buscarla..."),
  redactalos como un parrafo separado que empiece con la frase en negrita del
  caso, por ejemplo: **Para ingresar una nueva cuenta:** seguido del texto
  explicativo en la misma linea o en un parrafo aparte, en vez de una lista
  con vinetas.
- Los unicos asteriscos permitidos en tu respuesta son los dobles **para
  negrita**; nunca un asterisco o guion suelto al inicio de una linea.

Usa UNICAMENTE la siguiente informacion extraida del manual para responder. Si la
respuesta no se encuentra en el contexto, no inventes pasos: responde UNICAMENTE
con esta frase exacta, sin agregar nada mas: "{FRASE_SIN_INFORMACION}"

Si el contexto incluye tanto la causa de un problema como su solucion o
procedimiento para resolverlo, incluye SIEMPRE ambas partes, integradas en una
explicacion fluida y conversacional (no como una plantilla rigida con
encabezados tipo "Causa:" / "Solucion:"). Por ejemplo, en vez de separar
"Causa: X. Solucion: Y", escribe algo como "Eso pasa porque X. Para
solucionarlo, sigue estos pasos:" y luego los pasos numerados. Nunca respondas
unicamente con la causa si el contexto tambien contiene la solucion.{aviso_sinonimos}{aviso_citas}{aviso_saludo}{aviso_ticket}

Contexto del manual:
{contexto}

Pregunta del usuario: {pregunta}

Responde en espanol, en un tono calido y cercano, explicando primero brevemente
que esta pasando y luego los pasos numerados para resolverlo cuando aplique:"""

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


def _respuesta_indica_sin_informacion(respuesta):
    """
    Revisa si la respuesta del modelo equivale a la frase de "no tengo esa
    informacion", tolerando que el modelo la envuelva en markdown (**negrita**)
    o comillas, en vez de exigir una coincidencia exacta al inicio del texto.
    """
    normalizado = respuesta.replace("*", "").replace('"', "").replace("'", "").strip().lower()
    return FRASE_SIN_INFORMACION.lower() in normalizado


_FUENTES_USADAS_REGEX = re.compile(r"\n?[ \t]*\**FUENTES[_ ]USADAS\**\s*:\s*([^\n]*)\s*$", re.IGNORECASE)


_VINETA_REGEX = re.compile(r"(?m)^[ \t]*[*\-][ \t]+")


def _sanitizar_formato(respuesta):
    """
    Red de seguridad por si el modelo, a pesar de la instruccion del prompt,
    igual emite vinetas de markdown con "*" o "-" al inicio de linea (el chat
    no las renderiza como lista, y quedarian como asteriscos/guiones sueltos
    visibles para el usuario). Se les quita el marcador, dejando el texto de
    la vineta como parrafo normal. No afecta al "**negrita**", que usa dos
    asteriscos pegados sin espacio y por lo tanto no matchea este patron.
    """
    return _VINETA_REGEX.sub("", respuesta)


def _extraer_fuentes_usadas(respuesta, total_chunks):
    """
    Busca al final de la respuesta el marcador FUENTES_USADAS que el prompt le
    pidio al modelo agregar, indicando cuales de las [FUENTE N] numeradas en
    el contexto realmente uso para responder. Esto evita citar en el chat
    fuentes que se le pasaron al modelo pero que no tuvieron nada que ver con
    la respuesta final (ej. secciones parecidas por titulo pero no usadas).

    Devuelve (respuesta_limpia, indices_usados):
      - respuesta_limpia: el texto sin la linea del marcador.
      - indices_usados: set de indices 1-based realmente usados, set() vacio
        si el modelo dijo explicitamente que no uso ninguna, o None si no se
        encontro el marcador (en cuyo caso el llamador debe usar todos los
        chunks como respaldo, igual que antes).
    """
    match = _FUENTES_USADAS_REGEX.search(respuesta)
    if not match:
        _debug("_extraer_fuentes_usadas: no se encontro el marcador FUENTES_USADAS, se usan todos los chunks como respaldo")
        return respuesta, None

    respuesta_limpia = respuesta[:match.start()].rstrip()
    crudo = match.group(1).strip().lower()

    if not crudo or crudo in ("ninguna", "ninguno", "none", "n/a", "-"):
        return respuesta_limpia, set()

    indices = set()
    for parte in re.split(r"[,\s]+", crudo):
        parte = parte.strip()
        if parte.isdigit():
            n = int(parte)
            if 1 <= n <= total_chunks:
                indices.add(n)

    _debug(f"_extraer_fuentes_usadas: marcador crudo={crudo!r} -> indices={indices}")
    return respuesta_limpia, indices


def _generar_respuesta_error_confirmado(pregunta_original, chunk_error):
    """
    Genera la respuesta final (causa + solucion) para un error frecuente que
    el usuario ya confirmo como el suyo via el flujo de evidencia. Reutiliza
    build_prompt/call_gemini_generate para mantener el mismo tono y formato
    que el resto de las respuestas de Casey.
    """
    requiere_ticket = chunk_error["metadata"]["requiere_ticket"]
    prompt = build_prompt(pregunta_original, [chunk_error], incluir_aviso_ticket=requiere_ticket)
    respuesta = call_gemini_generate(prompt)
    respuesta, _ = _extraer_fuentes_usadas(respuesta, 1)
    respuesta = _sanitizar_formato(respuesta)

    if requiere_ticket:
        respuesta = (
            respuesta.rstrip()
            + f"\n\nSi necesitas que se corrija directamente, abre un ticket de soporte aquí: {SUPPORT_TICKET_URL}"
        )

    return {
        "respuesta": respuesta,
        "fuentes": [],
        "imagenes": [],
        "imagen_evidencia": None,
        "pendiente_confirmacion": None,
    }


def _iniciar_confirmacion_error(pregunta_original, chunk_evidencia, candidatos_restantes_ids, intento):
    """
    Arma la respuesta que le pide al usuario confirmar, con la imagen del
    error candidato, si es o no el problema que esta presentando.
    """
    meta = chunk_evidencia["metadata"]
    titulo = meta.get("titulo") or "un error registrado"

    respuesta = (
        f'Encontré un posible error relacionado con tu consulta: **"{titulo}"**. '
        "¿Es este el error que estás presentando?"
    )

    return {
        "respuesta": respuesta,
        "fuentes": [],
        "imagenes": [],
        "imagen_evidencia": meta.get("imagen_url"),
        "pendiente_confirmacion": {
            "pregunta_original": pregunta_original,
            "error_id_actual": int(meta["seccion_id"]),
            "candidatos_restantes": candidatos_restantes_ids,
            "intento": intento,
        },
    }


def _resolver_confirmacion_error(contexto_error, confirmacion):
    """
    Continua el flujo de confirmacion con evidencia: el usuario ya respondio
    si el error mostrado es o no el suyo. contexto_error es el bloque que el
    frontend reenvia tal cual lo recibio en la respuesta anterior.

    Si el usuario confirma, se responde con la causa/solucion de ese error.
    Si no confirma, se prueba el siguiente candidato (si queda alguno dentro
    del limite de intentos). Si ya no quedan candidatos, NO se vuelve a
    buscar automaticamente con la misma pregunta: en vez de eso, se invita
    al usuario a describir el problema con sus propias palabras. Su proximo
    mensaje entra como una consulta nueva por el flujo normal de
    answer_question (que ya busca en el manual y en los demas errores), y
    solo si esa busqueda nueva tampoco encuentra nada se le informara que no
    hay informacion registrada.
    """
    pregunta_original = contexto_error.get("pregunta_original", "")
    error_id_actual = contexto_error.get("error_id_actual")
    candidatos_restantes = list(contexto_error.get("candidatos_restantes") or [])
    intento = contexto_error.get("intento", 1)

    if confirmacion:
        chunk = _obtener_chunk_error(error_id_actual)
        if chunk is None:
            return {
                "respuesta": "Aún no tenemos información registrada para ese error.",
                "fuentes": [],
                "imagenes": [],
                "imagen_evidencia": None,
                "pendiente_confirmacion": None,
            }
        return _generar_respuesta_error_confirmado(pregunta_original, chunk)

    if intento < MAX_INTENTOS_CONFIRMACION_EVIDENCIA and candidatos_restantes:
        siguiente_id = candidatos_restantes[0]
        resto = candidatos_restantes[1:]
        chunk_siguiente = _obtener_chunk_error(siguiente_id)

        if chunk_siguiente is None:

            return _resolver_confirmacion_error(
                {
                    "pregunta_original": pregunta_original,
                    "error_id_actual": siguiente_id,
                    "candidatos_restantes": resto,
                    "intento": intento,
                },
                confirmacion=False,
            )

        return _iniciar_confirmacion_error(pregunta_original, chunk_siguiente, resto, intento + 1)

    _debug("resolver_confirmacion_error: candidatos de evidencia agotados, se invita al usuario a reformular")
    return {
        "respuesta": (
            "No logré identificar el error exacto con la información que tengo registrada. "
            "¿Podrías contarme con un poco más de detalle qué error te aparece o en qué "
            "pantalla ocurre? Así puedo buscar de nuevo."
        ),
        "fuentes": [],
        "imagenes": [],
        "imagen_evidencia": None,
        "pendiente_confirmacion": None,
    }


def answer_question(question, contexto_error=None, confirmacion=None):
    """
    Funcion principal del RAG: busca contexto relevante, genera la respuesta
    y arma la lista de fuentes (seccion_id + titulo + pagina) e imagenes
    relacionadas.

    Si contexto_error y confirmacion vienen dados, significa que el usuario
    esta respondiendo a una pregunta previa de confirmacion con evidencia
    ("¿es este tu error?"), y se resuelve ese flujo en vez de tratar
    "question" como una pregunta nueva.

    Devuelve un diccionario con las llaves: respuesta, fuentes, imagenes,
    imagen_evidencia, pendiente_confirmacion.
    """
    if contexto_error is not None and confirmacion is not None:
        return _resolver_confirmacion_error(contexto_error, confirmacion)

    if es_mensaje_sin_sentido(question):
        return {
            "respuesta": "Disculpa, ¿podrías darme un poco más de contexto sobre tu consulta?",
            "fuentes": [],
            "imagenes": [],
            "imagen_evidencia": None,
            "pendiente_confirmacion": None,
        }

    if es_saludo_o_cortesia(question):
        prompt = build_prompt(question, [], incluir_aviso_ticket=False)
        respuesta = call_gemini_generate(prompt)
        return {
            "respuesta": respuesta,
            "fuentes": [],
            "imagenes": [],
            "imagen_evidencia": None,
            "pendiente_confirmacion": None,
        }

    if es_pregunta_sobre_el_asistente(question):
        return {
            "respuesta": RESPUESTA_SOBRE_ASISTENTE,
            "fuentes": [],
            "imagenes": [],
            "imagen_evidencia": None,
            "pendiente_confirmacion": None,
        }


    _t_inicio = time.time()
    with ThreadPoolExecutor(max_workers=2) as executor:
        futuro_analisis = executor.submit(analizar_pregunta, question)
        futuro_chunks = executor.submit(search_relevant_chunks, question)
        analisis = futuro_analisis.result()
        chunks_crudos = futuro_chunks.result()
    _debug(f"tiempo analisis+busqueda_base: {time.time() - _t_inicio:.2f}s")

    correccion = analisis["correccion"]
    terminos_clave = analisis["terminos_clave"]


    pregunta_efectiva = correccion or question
    if correccion and es_saludo_o_cortesia(correccion):
        prompt = build_prompt(correccion, [], incluir_aviso_ticket=False)
        respuesta = call_gemini_generate(prompt)
        respuesta = _sanitizar_formato(respuesta)
        return {
            "respuesta": respuesta,
            "fuentes": [],
            "imagenes": [],
            "imagen_evidencia": None,
            "pendiente_confirmacion": None,
        }

    terminos_para_aviso = list(dict.fromkeys(list(terminos_clave) + _sinonimos_fijos(question)))
    if terminos_para_aviso:
        _t_expandida = time.time()
        texto_expandido = question + " (" + ", ".join(terminos_para_aviso) + ")"
        try:
            chunks_expandidos = search_relevant_chunks(
                texto_expandido,
                max_reintentos=REINTENTOS_BEST_EFFORT,
                timeout=TIMEOUT_BEST_EFFORT_SEGUNDOS,
            )
            chunks_crudos = _fusionar_chunks(chunks_crudos, chunks_expandidos)
        except (RuntimeError, requests.exceptions.RequestException) as e:
            _debug(f"busqueda expandida fallo, se continua solo con la busqueda base: {e}")
        _debug(f"tiempo busqueda expandida: {time.time() - _t_expandida:.2f}s")
        _debug(
            "answer_question: resultados fusionados (base + expandida) -> "
            + str([(c["metadata"]["seccion_id"], c["metadata"]["titulo"], round(c["distance"], 4)) for c in chunks_crudos])
        )

    chunks_crudos = _aplicar_boost_sinonimos(chunks_crudos, question)
    _debug(
        "answer_question: resultados tras boost por sinonimos -> "
        + str([(c["metadata"]["seccion_id"], c["metadata"]["titulo"], round(c["distance"], 4)) for c in chunks_crudos])
    )

    chunks_relevantes = filtrar_por_relevancia(chunks_crudos)
    def _umbral_para(chunk):
        return MAX_DISTANCE_ERROR if chunk["metadata"]["origen"] == "error" else MAX_DISTANCE_ABSOLUTE

    chunks = [c for c in chunks_relevantes if c["distance"] <= _umbral_para(c)]

    _debug(f"answer_question: chunks tras umbral MAX_DISTANCE_ABSOLUTE={MAX_DISTANCE_ABSOLUTE} -> {len(chunks)} chunk(s)")

    candidatos_evidencia = sorted(
        (c for c in chunks if c["metadata"]["origen"] == "error" and c["metadata"].get("tiene_evidencia")),
        key=lambda c: c["distance"],
    )
    if candidatos_evidencia:
        primero = candidatos_evidencia[0]
        resto_ids = [int(c["metadata"]["seccion_id"]) for c in candidatos_evidencia[1:]]
        _debug(
            "answer_question: candidato con evidencia encontrado -> "
            f"{primero['metadata']['seccion_id']} ({primero['metadata']['titulo']}), "
            f"candidatos_restantes={resto_ids}"
        )
        return _iniciar_confirmacion_error(question, primero, resto_ids, intento=1)

    requiere_ticket = any(c["metadata"].get("requiere_ticket") for c in chunks)

    prompt = build_prompt(
        pregunta_efectiva,
        chunks,
        incluir_aviso_ticket=requiere_ticket,
        terminos_clave=terminos_para_aviso,
        omitir_saludo=bool(correccion),
    )
    _t_generacion = time.time()
    respuesta = call_gemini_generate(prompt)
    _debug(f"tiempo generacion final: {time.time() - _t_generacion:.2f}s")

    respuesta, indices_usados = _extraer_fuentes_usadas(respuesta, len(chunks))
    respuesta = _sanitizar_formato(respuesta)

    sin_informacion = _respuesta_indica_sin_informacion(respuesta)
    _debug(f"answer_question: sin_informacion={sin_informacion}")

    if sin_informacion or not chunks:
        fuentes = []
        imagenes = []
    else:
        if indices_usados is None:
            chunks_para_citar = chunks
        else:
            chunks_para_citar = [chunks[i - 1] for i in sorted(indices_usados)]

        _debug(
            "answer_question: chunks citados -> "
            + str([(c["metadata"]["seccion_id"], c["metadata"]["titulo"]) for c in chunks_para_citar])
        )

        fuentes = _fuentes_unicas(chunks_para_citar, chunks_disponibles=chunks)

        imagenes_raw = []
        for c in chunks_para_citar:
            imagenes_raw.extend(c["metadata"].get("imagenes") or [])
        imagenes = list(dict.fromkeys(imagenes_raw))  # sin duplicados, conserva el orden

        if requiere_ticket:
            respuesta = (
                respuesta.rstrip()
                + f"\n\nSi necesitas que se corrija directamente, abre un ticket de soporte aquí: {SUPPORT_TICKET_URL}"
            )

    if correccion:
        respuesta = f'Si quisiste decir **"{correccion}"**, esto es lo que necesitas saber:\n\n' + respuesta

    _debug(f"tiempo TOTAL answer_question: {time.time() - _t_inicio:.2f}s")

    return {
        "respuesta": respuesta,
        "fuentes": fuentes,
        "imagenes": imagenes,
        "imagen_evidencia": None,
        "pendiente_confirmacion": None,
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
    if resultado.get("imagen_evidencia"):
        print(f"\nImagen de evidencia (confirmacion pendiente): {resultado['imagen_evidencia']}")