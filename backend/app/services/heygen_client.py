"""
Cliente de HeyGen (voz + composición Hyperframes). ESQUELETO.

Todavía no hace ninguna llamada: cada método lanza NotImplementedError y el
router lo registra como error del trabajo. Se completa en la fase de HeyGen.

Notas de la prueba previa para esa fase:
    Voz: POST /v3/models/audio/tts (language "es", pausas con [pause]); devuelve
         audio_url y duration.
    Render: zip del proyecto Hyperframes por direct upload y
         POST /v3/hyperframes/renders con resolution "1080p", aspect_ratio "16:9",
         format "mp4" e Idempotency-Key. La lista de escenas viaja como texto
         JSON (las variables no aceptan listas) y el audio debe ser un <audio>
         estático en el HTML (el mezclador no ve audio creado por script).
    Estado: GET /v3/hyperframes/renders/{id}; video_url es prefirmada y caduca
         a los 7 días, así que consultar_render devuelve siempre un enlace nuevo.
    Cancelar: DELETE /v3/hyperframes/renders/{id}.
    Recursos: DELETE /v3/assets/{id} para capturas, audios y zip.
"""

from .. import config
from .proveedor_video import (
    EscenaRender,
    EstadoRender,
    InicioRender,
    Narracion,
    OpcionesRender,
    validar_resolucion,
)

HEYGEN_API_BASE_URL = "https://api.heygen.com"
MENSAJE_PENDIENTE = "El cliente de HeyGen todavía no está implementado (fase posterior)."


class ProveedorHeyGen:
    """Implementación de ProveedorVideo para HeyGen. Pendiente de completar."""

    nombre = "heygen"

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or config.HEYGEN_API_KEY

    def generar_narracion(self, texto: str) -> Narracion:
        """POST /v3/models/audio/tts. Devuelve audio_url y duración."""
        raise NotImplementedError(MENSAJE_PENDIENTE)

    def iniciar_render(self, escenas: list[EscenaRender], opciones: OpcionesRender) -> InicioRender:
        """Sube los recursos y el zip, y crea el render (siempre 1080p)."""
        validar_resolucion(opciones.resolucion)
        raise NotImplementedError(MENSAJE_PENDIENTE)

    def consultar_render(self, render_id: str) -> EstadoRender:
        """GET /v3/hyperframes/renders/{id}: estado y enlace de descarga vigente."""
        raise NotImplementedError(MENSAJE_PENDIENTE)

    def cancelar(self, render_id: str) -> None:
        """DELETE /v3/hyperframes/renders/{id}."""
        raise NotImplementedError(MENSAJE_PENDIENTE)

    def borrar_recursos(self, ids: list[str]) -> None:
        """DELETE /v3/assets/{id} por cada recurso subido."""
        raise NotImplementedError(MENSAJE_PENDIENTE)
