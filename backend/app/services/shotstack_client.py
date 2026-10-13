"""
Construye el timeline JSON de Shotstack a partir del guion generado y hace las
llamadas HTTP al Edit API (sin SDK, con requests, mismo patrón que ya usan
para la Supabase Storage REST API).

Sincronización de escenas:
Shotstack NO sincroniza automáticamente imagen/texto con la duración real del
audio de texto-a-voz (el "auto" en clips de imagen/texto usa 3 segundos fijos).
Por eso acá se estima la duración de cada escena a partir del conteo de
palabras del texto narrado, y esa misma duración explícita se aplica a las
tres pistas (imagen, texto, audio) de la escena. Si en la práctica el ritmo
de la voz elegida es más rápido/lento que la estimación, ajustar
SHOTSTACK_WORDS_PER_SECOND en la configuración.
"""

import logging
import requests

from .. import config

logger = logging.getLogger(__name__)


def estimar_duracion_segundos(texto: str) -> float:
    palabras = max(len((texto or "").split()), 1)
    duracion = palabras / config.SHOTSTACK_WORDS_PER_SECOND
    return round(duracion + config.SHOTSTACK_ESCENA_PADDING_SEGUNDOS, 2)


def _clip_texto(escena: dict, start: float, length: float) -> dict:
    return {
        "asset": {
            "type": "html",
            "html": f"<p>{escena['titulo_pantalla']}</p>",
            "css": (
                "p { font-family: 'Montserrat ExtraBold'; color: #ffffff; "
                "font-size: 42px; text-align: center; line-height: 1.3; "
                "background-color: rgba(0,0,0,0.55); padding: 24px; "
                "border-radius: 12px; }"
            ),
            "width": 1000,
            "height": 240,
        },
        "start": start,
        "length": length,
        "position": "bottom",
        "offset": {"y": 0.08},
    }


def _clip_imagen(imagen_url: str, start: float, length: float) -> dict:
    return {
        "asset": {"type": "image", "src": imagen_url},
        "start": start,
        "length": length,
        "fit": "contain",
    }


def _clip_audio(escena: dict, start: float, length: float) -> dict:
    return {
        "asset": {
            "type": "text-to-speech",
            "text": escena["texto_narracion"],
            "voice": config.SHOTSTACK_TTS_VOICE,
            "language": config.SHOTSTACK_TTS_LANGUAGE,
        },
        "start": start,
        "length": length,
    }


def construir_timeline(escenas: list[dict]) -> dict:
    """
    escenas: [{"titulo_pantalla": str, "texto_narracion": str, "imagen_url": str | None}, ...]
    Cada escena trae su propia imagen (o None si esa escena no lleva imagen,
    ej. la intro o el cierre de "puntos a considerar"). Ya no se reparten
    imágenes de una lista genérica entre escenas: la asociación viene dada
    directamente por quien arma el guion (ver video_generation.py).
    """
    if not escenas:
        raise ValueError("No hay escenas para construir el timeline.")

    clips_texto = []
    clips_imagen = []
    clips_audio = []

    cursor = 0.0

    for escena in escenas:
        duracion = estimar_duracion_segundos(escena["texto_narracion"])

        imagen_url = escena.get("imagen_url")
        if imagen_url:
            clips_imagen.append(_clip_imagen(imagen_url, cursor, duracion))

        clips_texto.append(_clip_texto(escena, cursor, duracion))
        clips_audio.append(_clip_audio(escena, cursor, duracion))

        cursor += duracion

    tracks = []
    tracks.append({"clips": clips_texto})          # capa superior: texto
    if clips_imagen:
        tracks.append({"clips": clips_imagen})       # capa media: imágenes
    tracks.append({"clips": clips_audio})           # narración (no visual)

    payload = {
        "timeline": {
            "background": "#000000",
            "tracks": tracks,
        },
        "output": {
            "format": "mp4",
            "size": {"width": 1280, "height": 720},
        },
    }

    if config.SHOTSTACK_WEBHOOK_URL:
        payload["callback"] = config.SHOTSTACK_WEBHOOK_URL

    return payload


def enviar_render(payload: dict) -> str:
    """Envía el timeline a Shotstack. Devuelve el render id (shotstack_render_id)."""
    resp = requests.post(
        f"{config.SHOTSTACK_EDIT_BASE_URL}/render",
        headers={
            "x-api-key": config.SHOTSTACK_API_KEY,
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=15,
    )
    if resp.status_code >= 400:
        raise ValueError(f"Shotstack rechazó el render ({resp.status_code}): {resp.text[:800]}")

    data = resp.json()
    render_id = data.get("response", {}).get("id")
    if not render_id:
        raise ValueError(f"Shotstack no devolvió un render id: {data}")
    return render_id


def consultar_estado_render(render_id: str) -> dict:
    """
    Útil para un botón de "actualizar estado" manual en el admin, además del webhook.
    Devuelve el bloque "response" de Shotstack (incluye status y url cuando termina).
    """
    resp = requests.get(
        f"{config.SHOTSTACK_EDIT_BASE_URL}/render/{render_id}",
        headers={"x-api-key": config.SHOTSTACK_API_KEY},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("response", {})