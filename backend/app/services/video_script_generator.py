"""
Convierte el título, la descripción del inconveniente, una lista ordenada de
pasos (cada uno con su propio texto) y los puntos a considerar en un guion
estructurado por escenas, usando Gemini.

A diferencia de la primera versión, el número de escenas ahora es
DETERMINÍSTICO: 1 (introducción) + una por cada paso recibido + 1 si hay
puntos a considerar. Esto es necesario para poder asociar la imagen de cada
paso con su escena exacta (índice a índice), en vez de repartir imágenes
"a ciegas" entre escenas generadas libremente por el modelo.

Usa el mismo patrón que rag_query.py: llamada REST directa (sin SDK).
"""

import json
import re
import time
import logging

import requests

from ..config import GEMINI_API_KEY, GEMINI_GENERATION_MODEL

logger = logging.getLogger(__name__)

GEMINI_GENERATE_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_GENERATION_MODEL}:generateContent"
)

GENERATION_TEMPERATURE = 0.15
MAX_REINTENTOS = 5
REQUEST_TIMEOUT_SEGUNDOS = 20


PROMPT_GUION = """Sos un asistente que convierte un reporte de error interno, ya dividido en pasos por un técnico, en un guion para un video tutorial de capacitación de una cooperativa financiera.

Vas a recibir el título del problema, su descripción, y una lista ORDENADA de pasos de la solución que el técnico ya escribió. Generá EXACTAMENTE una escena por cada uno de estos bloques, en este orden:

1. Una escena de introducción, presentando el problema (a partir del título y la descripción).
2. Una escena por CADA paso de la lista, en el MISMO ORDEN y la MISMA CANTIDAD que se te dan ({n_pasos} pasos → {n_pasos} escenas). No combines dos pasos en una escena ni dividas un paso en dos. El "texto_narracion" debe transmitir la misma idea del paso, reformulada en un tono natural y conversacional para ser leída en voz alta (no la copies literal si suena robótica, pero no cambies el significado ni omitas instrucciones).
3. {instruccion_puntos}

Reglas estrictas:
- Cada escena tiene "titulo_pantalla" (máximo 8 palabras, texto que aparece en pantalla) y "texto_narracion" (1 a 3 oraciones en español neutro, tono claro y profesional).
- No uses emojis ni caracteres decorativos.
- No repitas literalmente "titulo_pantalla" dentro de "texto_narracion".
- El total de escenas debe ser EXACTAMENTE {escenas_esperadas}. Esto es un requisito estricto, no una sugerencia.
- Devolvé ÚNICAMENTE un JSON válido, sin texto adicional antes o después, sin backticks de markdown, con este formato exacto:
{{"escenas": [{{"titulo_pantalla": "...", "texto_narracion": "..."}}]}}
- En caso de no tener 
Título: {titulo}
Descripción del inconveniente: {descripcion}

Pasos de la solución, en orden:
{pasos_formateados}

Puntos a considerar: {puntos}
"""


def _post_con_reintentos(body, max_reintentos=MAX_REINTENTOS, timeout=REQUEST_TIMEOUT_SEGUNDOS):
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
            time.sleep(2 ** intento)
            continue

        respuesta.raise_for_status()
        return respuesta.json()

    raise RuntimeError(f"Se agotaron los reintentos hacia Gemini (rate limit o timeout). Ultimo error: {ultimo_error}")


def _limpiar_json(texto: str) -> str:
    texto = texto.strip()
    texto = re.sub(r"^```(?:json)?\s*", "", texto)
    texto = re.sub(r"\s*```$", "", texto)
    return texto.strip()


def generar_guion(titulo: str, descripcion: str, pasos: list[str], puntos: str | None) -> list[dict]:
    """
    pasos: lista de textos, uno por cada paso de la solución (ya en orden).
    Devuelve una lista de escenas de longitud EXACTA 1 + len(pasos) + (1 si hay puntos).
    Lanza ValueError si Gemini no respeta ese conteo (el llamador puede reintentar
    generando el video de nuevo) o si el JSON no es válido.
    """
    pasos_limpios = [p.strip() for p in pasos if p and p.strip()]
    if not pasos_limpios:
        raise ValueError("Se necesita al menos un paso con texto para generar el guion.")

    incluye_puntos = bool(puntos and puntos.strip())
    escenas_esperadas = 1 + len(pasos_limpios) + (1 if incluye_puntos else 0)

    pasos_formateados = "\n".join(f"{i + 1}. {p}" for i, p in enumerate(pasos_limpios))
    instruccion_puntos = (
        "Si se incluyen puntos a considerar (ver abajo), agregá UNA escena final con esos puntos como recomendaciones."
        if incluye_puntos
        else "No hay puntos a considerar en este caso: NO agregues ninguna escena adicional de cierre."
    )

    prompt = PROMPT_GUION.format(
        titulo=titulo,
        descripcion=descripcion,
        pasos_formateados=pasos_formateados,
        puntos=puntos.strip() if incluye_puntos else "Ninguno",
        n_pasos=len(pasos_limpios),
        instruccion_puntos=instruccion_puntos,
        escenas_esperadas=escenas_esperadas,
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
    texto_limpio = _limpiar_json(texto_crudo)

    try:
        data = json.loads(texto_limpio)
    except json.JSONDecodeError as exc:
        logger.error("Guion no es JSON válido: %s", texto_crudo[:500])
        raise ValueError(f"Gemini no devolvió un guion en formato JSON válido: {exc}") from exc

    escenas = data.get("escenas") if isinstance(data, dict) else None
    if not escenas or not isinstance(escenas, list):
        raise ValueError("El guion generado no contiene una lista de escenas válida.")

    for escena in escenas:
        if "titulo_pantalla" not in escena or "texto_narracion" not in escena:
            raise ValueError(f"Escena con formato incompleto: {escena}")

    if len(escenas) != escenas_esperadas:
        raise ValueError(
            f"El guion generado tiene {len(escenas)} escena(s), pero se esperaban exactamente "
            f"{escenas_esperadas} (1 introducción + {len(pasos_limpios)} paso(s)"
            + (" + 1 de puntos a considerar" if incluye_puntos else "")
            + "). Esto puede pasar ocasionalmente con el modelo de IA; probá generar el video de nuevo."
        )

    return escenas