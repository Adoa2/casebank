"""
Interfaz neutral de proveedor de video con IA.

El router de videos con IA solo conoce esta interfaz; cada proveedor (por
ahora solo HeyGen, en heygen_client.py) la implementa en su propio módulo. Así el
flujo de trabajos, los límites y la publicación no dependen del proveedor.

Contrato:
    generar_narracion(texto)            Voz de una escena. Devuelve su duración real.
    iniciar_render(escenas, opciones)   Envía la composición. Devuelve el id externo.
    consultar_render(render_id)         Estado del render y enlace de descarga vigente.
    cancelar(render_id)                 Pide al proveedor detener o borrar el render.
    borrar_recursos(ids)                Borra los archivos subidos al proveedor.

Cada llamada debe ser corta: el router las ejecuta dentro de un paso de
consulta del panel, nunca en un proceso largo.
"""

from dataclasses import dataclass, field
from typing import Protocol

from .. import config


# --- Tipos de intercambio ---

@dataclass
class Narracion:
    """Audio generado para una escena."""
    audio_url: str
    duracion_segundos: float
    recursos: list[str] = field(default_factory=list)  # ids externos a borrar al terminar


@dataclass
class EscenaRender:
    """Escena lista para componer: imagen, título, audio y duración."""
    titulo: str
    imagen_url: str | None
    audio_url: str
    duracion_segundos: float


@dataclass
class OpcionesRender:
    """Opciones fijas del render. La resolución no es configurable: siempre 1080p."""
    resolucion: str = config.VIDEO_IA_RESOLUCION
    relacion_aspecto: str = "16:9"
    formato: str = "mp4"
    clave_idempotencia: str | None = None
    titulo: str | None = None


@dataclass
class InicioRender:
    """Resultado de iniciar un render."""
    render_id: str
    recursos: list[str] = field(default_factory=list)


# Estados neutrales que devuelve consultar_render.
RENDER_EN_CURSO = "en_curso"
RENDER_COMPLETADO = "completado"
RENDER_FALLIDO = "fallido"


@dataclass
class EstadoRender:
    """Estado actual de un render en el proveedor."""
    estado: str  # RENDER_EN_CURSO | RENDER_COMPLETADO | RENDER_FALLIDO
    enlace_descarga: str | None = None  # puede caducar: se vuelve a pedir con consultar_render
    duracion_segundos: float | None = None
    mensaje_error: str | None = None


class ProveedorVideo(Protocol):
    """Interfaz que implementa cada proveedor de video con IA."""

    nombre: str

    def generar_narracion(self, texto: str) -> Narracion: ...

    def iniciar_render(self, escenas: list[EscenaRender], opciones: OpcionesRender) -> InicioRender: ...

    def consultar_render(self, render_id: str) -> EstadoRender: ...

    def cancelar(self, render_id: str) -> None: ...

    def borrar_recursos(self, ids: list[str]) -> None: ...


# --- Selección del proveedor ---

def validar_resolucion(resolucion: str) -> None:
    """Rechaza cualquier resolución distinta de 1080p (4K cuesta 1,5 veces más)."""
    if resolucion != config.VIDEO_IA_RESOLUCION:
        raise ValueError(f"Resolución no permitida: {resolucion}. Solo se admite {config.VIDEO_IA_RESOLUCION}.")


def obtener_proveedor(nombre: str | None = None) -> ProveedorVideo:
    """Devuelve la implementación del proveedor configurado (VIDEO_IA_PROVEEDOR)."""
    nombre = (nombre or config.VIDEO_IA_PROVEEDOR).strip().lower()
    if nombre == "heygen":
        from .heygen_client import ProveedorHeyGen
        return ProveedorHeyGen()
    raise ValueError(f"Proveedor de video no soportado: {nombre}")
