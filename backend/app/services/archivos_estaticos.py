"""
Sirve los archivos del almacenamiento local en ARCHIVOS_URL_BASE (por defecto
/api/archivos). Solo se monta con ALMACENAMIENTO_PROVEEDOR=local (main.py).

- Usa StaticFiles de Starlette con html=False: no lista carpetas ni sirve
  index.html. FileResponse ya admite Range (206/416), así que los mp4 se
  pueden adelantar.
- Solo responde rutas {bucket}/{nombre} con un bucket conocido y un nombre
  que cumpla almacenamiento.PATRON_NOMBRE y la extensión del bucket. Todo lo
  demás (temporales .tmp-*, carpetas, otras rutas) es 404.
- Añade X-Content-Type-Options: nosniff a todo, y Content-Security-Policy:
  sandbox a imágenes y videos (no a los PDF, para no romper el visor de PDF
  del navegador).

Los archivos son públicos para quien conozca la URL, igual que en los buckets
públicos de Supabase: la protección es el nombre aleatorio.

En producción Nginx puede servir la misma ruta directamente, sin pasar por
Python: ver la sección "Nginx en producción" del README.
"""

import os

from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from . import almacenamiento

CABECERA_NOSNIFF = ("X-Content-Type-Options", "nosniff")
CABECERA_SANDBOX = ("Content-Security-Policy", "sandbox")
EXTENSIONES_SIN_SANDBOX = {"pdf"}


class ArchivosEstaticos(StaticFiles):
    """StaticFiles restringido a los nombres que genera el servidor."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        partes = path.replace(os.sep, "/").split("/")
        if len(partes) != 2:
            raise HTTPException(status_code=404)
        bucket, nombre = partes
        try:
            almacenamiento.validar(bucket, nombre)
        except almacenamiento.ArchivoInvalido:
            raise HTTPException(status_code=404)

        respuesta = await super().get_response(path, scope)
        respuesta.headers[CABECERA_NOSNIFF[0]] = CABECERA_NOSNIFF[1]
        if nombre.rsplit(".", 1)[-1].lower() not in EXTENSIONES_SIN_SANDBOX:
            respuesta.headers[CABECERA_SANDBOX[0]] = CABECERA_SANDBOX[1]
        return respuesta


def montar_archivos_locales(app) -> None:
    """Crea las carpetas y monta ARCHIVOS_URL_BASE. No hace nada en modo supabase."""
    if not almacenamiento.es_local():
        return
    raiz = almacenamiento.preparar_carpetas_locales()
    app.mount(
        almacenamiento.config.ARCHIVOS_URL_BASE,
        ArchivosEstaticos(directory=str(raiz), html=False),
        name="archivos",
    )
