"""
Generador de guion para videos con IA.

Convierte el título, la descripción del inconveniente, la lista ordenada de
pasos y los puntos a considerar en un guion de escenas, usando Gemini.

El número de escenas es determinístico: 1 (introducción) + una por paso + 1 si
hay puntos a considerar. Cada escena trae:
    titulo:    texto corto que aparece en pantalla.
    narracion: texto para la voz, sin Markdown ni SSML; las pausas se marcan
               con [pause].
    captura:   número del paso (1..N) cuya imagen se muestra, o null.

La IA nunca devuelve URLs: la captura se resuelve después con las imágenes
que el usuario cargó en cada paso.

Usa el mismo patrón que rag_query.py: llamada REST directa (sin SDK).
"""

import json
import logging
import re
import time

import requests

from ..config import GEMINI_API_KEY, GEMINI_GENERATION_MODEL

logger = logging.getLogger(__name__)

GEMINI_GENERATE_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_GENERATION_MODEL}:generateContent"
)

GENERATION_TEMPERATURE = 0.15
# Pocos reintentos y timeout corto: esta llamada corre dentro de un paso de
# consulta del panel y no debe alargar la petición HTTP.
MAX_REINTENTOS = 2
REQUEST_TIMEOUT_SEGUNDOS = 20

MAX_PALABRAS_TITULO = 8
MAX_CARACTERES_NARRACION_ESCENA = 450


# --- Prompt ---

PROMPT_GUION = """Sos un asistente que convierte un reporte de error interno, ya dividido en pasos por un técnico, en un guion para un video tutorial de capacitación de una cooperativa financiera.

Vas a recibir el título del problema, su descripción y una lista ORDENADA de pasos de la solución. Generá EXACTAMENTE una escena por cada uno de estos bloques, en este orden:

1. Una escena de introducción que presente el problema (a partir del título y la descripción).
2. Una escena por CADA paso de la lista, en el MISMO ORDEN y la MISMA CANTIDAD ({n_pasos} pasos -> {n_pasos} escenas). No combines dos pasos en una escena ni dividas un paso en dos. La narración debe transmitir la misma idea del paso en un tono natural para ser leída en voz alta, sin cambiar el significado ni omitir instrucciones.
3. {instruccion_puntos}

Reglas estrictas:
- Cada escena tiene "titulo" (máximo {max_palabras_titulo} palabras, aparece en pantalla), "narracion" (1 a 2 oraciones cortas en español neutro, tono claro y profesional, máximo {max_caracteres_narracion} caracteres) y "captura".
- "captura" es el número del paso cuya imagen acompaña la escena: null en la introducción, el número del paso (1 a {n_pasos}) en cada escena de paso, y null en la escena de puntos a considerar.
- Para marcar una pausa en la narración escribí exactamente [pause]. No uses ninguna otra marca entre corchetes.
- Usá ortografía española completa, con todas las tildes y eñes (por ejemplo: parámetro, menú, operación, módulo, configuración). La voz lee el texto tal cual y sin tildes pronuncia mal.
- Escribí texto plano: sin Markdown (nada de asteriscos, almohadillas, guiones de lista ni comillas invertidas), sin etiquetas SSML ni HTML, sin emojis y sin URLs.
- No repitas literalmente el "titulo" dentro de la "narracion".
- El total de escenas debe ser EXACTAMENTE {escenas_esperadas}.
- Si algún dato no está en la información recibida, no lo inventes: narrá solo lo que el técnico escribió.
- Devolvé ÚNICAMENTE un JSON válido, sin texto antes o después y sin bloques de código, con este formato exacto:
{{"escenas": [{{"titulo": "...", "narracion": "...", "captura": null}}]}}

Título: {titulo}
Descripción del inconveniente: {descripcion}

Pasos de la solución, en orden:
{pasos_formateados}

Puntos a considerar: {puntos}
"""


# --- Limpieza de texto ---

_MARCA_PAUSA = "[pause]"
_RE_PAUSA_VARIANTES = re.compile(r"\[\s*(?:pause|pausa)\s*\]", re.IGNORECASE)
_RE_ENLACE_MD = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_RE_CORCHETES = re.compile(r"\[[^\]]*\]")
_RE_ETIQUETAS = re.compile(r"<[^>]+>")
_RE_BLOQUE_CODIGO = re.compile(r"```[a-zA-Z]*")
_RE_ENCABEZADO = re.compile(r"(?m)^\s{0,3}#{1,6}\s*")
_RE_CITA = re.compile(r"(?m)^\s*>\s?")
_RE_VINETA = re.compile(r"(?m)^\s*(?:[-*+]|\d+[.)])\s+")
_RE_ENFASIS = re.compile(r"(\*\*|__|\*|_|~~|`)")
_RE_URL = re.compile(r"https?://\S+")
_RE_EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️]")
_RE_ESPACIOS = re.compile(r"\s+")


def limpiar_markdown(texto: str | None) -> str:
    """
    Quita cualquier Markdown, SSML, HTML, URL o emoji que haya quedado en un
    texto del guion y deja una sola marca de pausa válida: [pause].
    """
    if not texto:
        return ""
    limpio = _RE_PAUSA_VARIANTES.sub("\u0000", texto)       # protege las pausas válidas
    limpio = _RE_BLOQUE_CODIGO.sub(" ", limpio)
    limpio = _RE_ENLACE_MD.sub(r"\1", limpio)               # [texto](url) -> texto
    limpio = _RE_CORCHETES.sub(" ", limpio)                 # otras marcas entre corchetes
    limpio = _RE_ETIQUETAS.sub(" ", limpio)                 # SSML o HTML
    limpio = _RE_ENCABEZADO.sub("", limpio)
    limpio = _RE_CITA.sub("", limpio)
    limpio = _RE_VINETA.sub("", limpio)
    limpio = _RE_ENFASIS.sub("", limpio)
    limpio = _RE_URL.sub(" ", limpio)
    limpio = _RE_EMOJI.sub("", limpio)
    limpio = limpio.replace("\u0000", f" {_MARCA_PAUSA} ")
    limpio = _RE_ESPACIOS.sub(" ", limpio).strip()
    # Sin pausas repetidas, al inicio ni al final.
    limpio = re.sub(r"(?:\[pause\]\s*){2,}", f"{_MARCA_PAUSA} ", limpio).strip()
    limpio = re.sub(r"^\[pause\]\s*|\s*\[pause\]$", "", limpio).strip()
    return limpio


def texto_hablado(narracion: str) -> str:
    """Narración sin marcas de pausa: es lo que cuenta como caracteres de voz."""
    return _RE_ESPACIOS.sub(" ", narracion.replace(_MARCA_PAUSA, " ")).strip()


def _recortar_palabras(texto: str, maximo: int) -> str:
    palabras = texto.split()
    return " ".join(palabras[:maximo])


# --- Llamada a Gemini ---

def _post_con_reintentos(body, max_reintentos=MAX_REINTENTOS, timeout=REQUEST_TIMEOUT_SEGUNDOS):
    """POST a Gemini con reintentos cortos ante 429, timeout o error de conexión."""
    ultimo_error = None
    for intento in range(max_reintentos):
        try:
            respuesta = requests.post(
                GEMINI_GENERATE_URL,
                headers={"x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json"},
                json=body,
                timeout=timeout,
            )
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            ultimo_error = e
            time.sleep(2 ** intento)
            continue

        if respuesta.status_code == 429:
            ultimo_error = "429 (límite de peticiones)"
            time.sleep(2 ** intento)
            continue

        respuesta.raise_for_status()
        return respuesta.json()

    raise RuntimeError(f"Se agotaron los reintentos hacia Gemini. Último error: {ultimo_error}")


def _limpiar_json(texto: str) -> str:
    texto = texto.strip()
    texto = re.sub(r"^```(?:json)?\s*", "", texto)
    texto = re.sub(r"\s*```$", "", texto)
    return texto.strip()


# --- Generación ---

def escenas_esperadas(n_pasos: int, incluye_puntos: bool) -> int:
    """Cantidad exacta de escenas del guion: introducción + pasos + puntos (si hay)."""
    return 1 + n_pasos + (1 if incluye_puntos else 0)


def generar_guion(titulo: str, descripcion: str, pasos: list[str], puntos: str | None) -> list[dict]:
    """
    pasos: textos de cada paso de la solución, en orden.
    Devuelve [{"titulo", "narracion", "captura"}] con longitud exacta
    1 + len(pasos) + (1 si hay puntos). Lanza ValueError si el modelo no
    respeta la estructura o una narración queda demasiado larga.
    """
    pasos_limpios = [p.strip() for p in pasos if p and p.strip()]
    if not pasos_limpios:
        raise ValueError("Se necesita al menos un paso con texto para generar el guion.")

    incluye_puntos = bool(puntos and puntos.strip())
    total = escenas_esperadas(len(pasos_limpios), incluye_puntos)

    prompt = PROMPT_GUION.format(
        titulo=titulo,
        descripcion=descripcion,
        pasos_formateados="\n".join(f"{i + 1}. {p}" for i, p in enumerate(pasos_limpios)),
        puntos=puntos.strip() if incluye_puntos else "Ninguno",
        n_pasos=len(pasos_limpios),
        instruccion_puntos=(
            "Como hay puntos a considerar, agregá UNA escena final con esos puntos como recomendaciones."
            if incluye_puntos
            else "No hay puntos a considerar: NO agregues ninguna escena adicional de cierre."
        ),
        escenas_esperadas=total,
        max_palabras_titulo=MAX_PALABRAS_TITULO,
        max_caracteres_narracion=MAX_CARACTERES_NARRACION_ESCENA,
    )

    datos = _post_con_reintentos({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": GENERATION_TEMPERATURE,
            "response_mime_type": "application/json",
        },
    })

    candidatos = datos.get("candidates") or []
    if not candidatos:
        raise ValueError("Gemini no devolvió candidatos para el guion.")
    partes = candidatos[0].get("content", {}).get("parts", [])
    if not partes:
        raise ValueError("Gemini devolvió una respuesta vacía para el guion (posible bloqueo de contenido).")

    texto_crudo = partes[0].get("text", "").strip()
    try:
        data = json.loads(_limpiar_json(texto_crudo))
    except json.JSONDecodeError as exc:
        logger.error("Guion no es JSON válido: %s", texto_crudo[:500])
        raise ValueError(f"Gemini no devolvió un guion en formato JSON válido: {exc}") from exc

    escenas = data.get("escenas") if isinstance(data, dict) else None
    if not escenas or not isinstance(escenas, list):
        raise ValueError("El guion generado no contiene una lista de escenas válida.")
    if len(escenas) != total:
        raise ValueError(
            f"El guion tiene {len(escenas)} escena(s) y se esperaban {total}. "
            "Puede pasar ocasionalmente con el modelo de IA; probá generar el video de nuevo."
        )

    return [_normalizar_escena(e, i, len(pasos_limpios)) for i, e in enumerate(escenas)]


def _normalizar_escena(escena: dict, indice: int, n_pasos: int) -> dict:
    """
    Limpia los textos de una escena y fija su captura según la posición:
    0 = introducción (sin captura), 1..N = paso N, resto = puntos (sin captura).
    """
    if not isinstance(escena, dict) or "titulo" not in escena or "narracion" not in escena:
        raise ValueError(f"Escena con formato incompleto: {escena}")

    titulo = _recortar_palabras(limpiar_markdown(str(escena["titulo"])).replace("[pause]", " "), MAX_PALABRAS_TITULO)
    narracion = limpiar_markdown(str(escena["narracion"]))
    if not titulo or not texto_hablado(narracion):
        raise ValueError(f"La escena {indice + 1} quedó sin título o sin narración.")
    if len(texto_hablado(narracion)) > MAX_CARACTERES_NARRACION_ESCENA:
        raise ValueError(f"La narración de la escena {indice + 1} supera los {MAX_CARACTERES_NARRACION_ESCENA} caracteres.")

    captura_esperada = indice if 1 <= indice <= n_pasos else None
    if escena.get("captura") != captura_esperada:
        logger.info("Captura de la escena %s corregida: %r -> %r", indice + 1, escena.get("captura"), captura_esperada)

    return {"titulo": titulo, "narracion": narracion, "captura": captura_esperada}
