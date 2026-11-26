"""
Capa de almacenamiento de archivos subidos: carpeta local o Supabase Storage.

Se elige con ALMACENAMIENTO_PROVEEDOR ("supabase" por defecto, o "local").
Los routers solo usan las funciones públicas de este módulo:

    subir(bucket, nombre, contenido, tipo_mime)          -> url
    subir_archivo(bucket, nombre, ruta_local, tipo_mime) -> url
    leer(bucket, nombre)                                 -> bytes
    borrar(bucket, nombre)
    url_publica(bucket, nombre)                          -> url
    nombre_desde_url(bucket, url)                        -> nombre | None

Buckets: los 4 de BUCKETS. En modo local cada uno es una subcarpeta de
ARCHIVOS_DIR y las URLs son relativas: {ARCHIVOS_URL_BASE}/{bucket}/{nombre}
(por defecto /api/archivos/...). En modo supabase las URLs son las públicas
de siempre: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{nombre}.

Los nombres de archivo los genera siempre el servidor (generar_nombre o el
nombre aleatorio de los videos) y aquí se vuelven a validar contra
PATRON_NOMBRE y las extensiones del bucket: nunca se usa el nombre que manda
el cliente.
"""

import logging
import os
import re
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

import requests

from .. import config

logger = logging.getLogger(__name__)

PROVEEDOR_LOCAL = "local"
PROVEEDOR_SUPABASE = "supabase"
PROVEEDORES = {PROVEEDOR_LOCAL, PROVEEDOR_SUPABASE}

MB = 1024 * 1024

# Nombres fijos de buckets que no eran configurables antes.
BUCKET_ERRORES = "error-evidencias"
BUCKET_ACTUALIZACIONES = "actualizaciones-pdf"


@dataclass(frozen=True)
class ReglasBucket:
    """Límites de un bucket: tamaño máximo y extensión -> tipos MIME aceptados."""
    max_bytes: int
    extensiones: dict[str, set[str]]
    crear_si_falta: bool = False  # solo Supabase: crear el bucket si no existe


_REGLAS_IMAGEN = {"jpg": {"image/jpeg", "image/jpg"}, "png": {"image/png"}}


def _reglas() -> dict[str, ReglasBucket]:
    """Reglas por bucket. Se calcula en cada uso porque dos nombres salen de config."""
    return {
        BUCKET_ERRORES: ReglasBucket(5 * MB, _REGLAS_IMAGEN),
        BUCKET_ACTUALIZACIONES: ReglasBucket(15 * MB, {"pdf": {"application/pdf"}}, crear_si_falta=True),
        config.SUPABASE_BUCKET_VIDEOS_IA_IMAGENES: ReglasBucket(5 * MB, _REGLAS_IMAGEN),
        # 500 MB es el límite de subida del proyecto de Supabase.
        config.SUPABASE_BUCKET_VIDEOS_IA: ReglasBucket(500 * MB, {"mp4": {"video/mp4"}}),
    }


def buckets() -> list[str]:
    return list(_reglas())


# Letras, dígitos, guion y guion bajo, sin empezar por punto ni guion, y una
# sola extensión. Cubre uuid4().hex.ext y trabajo-{id}-{sufijo}.mp4.
PATRON_NOMBRE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.([a-z0-9]{2,5})$")


class ErrorAlmacenamiento(Exception):
    """Fallo al guardar, leer o borrar. estado_http sugiere la respuesta al cliente."""

    def __init__(self, mensaje: str, estado_http: int = 502):
        super().__init__(mensaje)
        self.estado_http = estado_http


class ArchivoInvalido(ErrorAlmacenamiento):
    """Nombre, tipo o tamaño no permitido para el bucket (respuesta 400)."""

    def __init__(self, mensaje: str):
        super().__init__(mensaje, 400)


class AlmacenamientoNoConfigurado(ErrorAlmacenamiento):
    """Faltan variables de entorno del proveedor elegido (respuesta 500)."""

    def __init__(self, mensaje: str):
        super().__init__(mensaje, 500)


class ArchivoNoEncontrado(ErrorAlmacenamiento):
    def __init__(self, mensaje: str = "El archivo no existe."):
        super().__init__(mensaje, 404)


# --- Validaciones comunes ---

FIRMA_PNG = b"\x89PNG\r\n\x1a\n"
FIRMA_JPEG = b"\xff\xd8\xff"


def tipo_imagen_por_firma(contenido: bytes) -> str | None:
    """Devuelve "image/png" o "image/jpeg" según los primeros bytes, o None."""
    if contenido.startswith(FIRMA_PNG):
        return "image/png"
    if contenido.startswith(FIRMA_JPEG):
        return "image/jpeg"
    return None


def validar_imagen(contenido: bytes, tipo_declarado: str | None, max_bytes: int = 5 * MB) -> tuple[str, str]:
    """
    Valida una imagen subida por el cliente: tipo declarado JPG/PNG, tamaño y
    firma real de los bytes. Devuelve (extension, tipo_mime) según la firma,
    no según lo que declaró el cliente. Lanza ArchivoInvalido.
    """
    if (tipo_declarado or "").lower() not in {"image/jpeg", "image/jpg", "image/png"}:
        raise ArchivoInvalido("Solo se permiten imágenes en formato JPG, JPEG o PNG.")
    if len(contenido) > max_bytes:
        raise ArchivoInvalido(f"La imagen no debe superar los {max_bytes // MB} MB.")
    tipo_real = tipo_imagen_por_firma(contenido)
    if not tipo_real:
        raise ArchivoInvalido("El archivo no es una imagen JPG o PNG válida.")
    return ("png" if tipo_real == "image/png" else "jpg"), tipo_real


def generar_nombre(extension: str) -> str:
    """Nombre aleatorio generado por el servidor: uuid4 en hex + extensión."""
    return f"{uuid.uuid4().hex}.{extension.lower().lstrip('.')}"


def validar(bucket: str, nombre: str, tipo_mime: str | None = None, tamano: int | None = None) -> ReglasBucket:
    """Comprueba bucket conocido, nombre seguro, extensión, tipo MIME y tamaño."""
    reglas = _reglas().get(bucket)
    if reglas is None:
        raise ArchivoInvalido(f"Bucket desconocido: {bucket!r}.")
    coincidencia = PATRON_NOMBRE.fullmatch(nombre or "")
    if not coincidencia:
        raise ArchivoInvalido("Nombre de archivo no válido.")
    extension = coincidencia.group(1)
    if extension not in reglas.extensiones:
        raise ArchivoInvalido(f"Extensión .{extension} no permitida en {bucket}.")
    if tipo_mime is not None and tipo_mime.lower() not in reglas.extensiones[extension]:
        raise ArchivoInvalido(f"Tipo {tipo_mime} no permitido para .{extension}.")
    if tamano is not None and tamano > reglas.max_bytes:
        raise ArchivoInvalido(f"El archivo supera el máximo de {reglas.max_bytes // MB} MB para {bucket}.")
    return reglas


def proveedor() -> str:
    valor = (config.ALMACENAMIENTO_PROVEEDOR or PROVEEDOR_SUPABASE).strip().lower()
    if valor not in PROVEEDORES:
        raise AlmacenamientoNoConfigurado(
            f"ALMACENAMIENTO_PROVEEDOR={valor!r} no es válido; usa 'supabase' o 'local'."
        )
    return valor


def es_local() -> bool:
    return proveedor() == PROVEEDOR_LOCAL


# --- Implementación local ---

def raiz_local() -> Path:
    """Carpeta raíz ARCHIVOS_DIR, resuelta a ruta absoluta."""
    if not config.ARCHIVOS_DIR:
        raise AlmacenamientoNoConfigurado(
            "ALMACENAMIENTO_PROVEEDOR=local requiere ARCHIVOS_DIR (carpeta raíz de los archivos)."
        )
    return Path(config.ARCHIVOS_DIR).expanduser().resolve()


def _ruta_local(bucket: str, nombre: str) -> Path:
    """Ruta absoluta del archivo, verificando que queda dentro de su carpeta."""
    carpeta = (raiz_local() / bucket).resolve()
    ruta = (carpeta / nombre).resolve()
    if ruta.parent != carpeta or not ruta.is_relative_to(raiz_local()):
        raise ArchivoInvalido("Ruta de archivo fuera de la carpeta de almacenamiento.")
    return ruta


def _asegurar_carpeta(bucket: str) -> Path:
    carpeta = raiz_local() / bucket
    carpeta.mkdir(mode=0o750, parents=True, exist_ok=True)
    return carpeta


def preparar_carpetas_locales() -> Path:
    """Crea ARCHIVOS_DIR y las carpetas de los 4 buckets si no existen."""
    raiz = raiz_local()
    raiz.mkdir(mode=0o750, parents=True, exist_ok=True)
    for bucket in buckets():
        _asegurar_carpeta(bucket)
    return raiz


def _escribir_atomico(destino: Path, escribir) -> None:
    """
    Escribe en un temporal oculto de la misma carpeta y lo renombra al final,
    para que nunca se sirva un archivo a medio escribir. No pisa archivos.
    """
    if destino.exists():
        raise ErrorAlmacenamiento("Ya existe un archivo con ese nombre.", 409)
    descriptor, temporal = tempfile.mkstemp(dir=destino.parent, prefix=".tmp-", suffix=".parcial")
    try:
        with os.fdopen(descriptor, "wb") as salida:
            escribir(salida)
            salida.flush()
            os.fsync(salida.fileno())
        os.chmod(temporal, 0o640)
        os.replace(temporal, destino)
    except BaseException:
        try:
            os.unlink(temporal)
        except FileNotFoundError:
            pass
        raise


def _url_local(bucket: str, nombre: str) -> str:
    return f"{config.ARCHIVOS_URL_BASE.rstrip('/')}/{bucket}/{nombre}"


# --- Implementación Supabase (mismas llamadas HTTP que la versión anterior) ---

def _base_supabase() -> str:
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        raise AlmacenamientoNoConfigurado(
            "Supabase Storage no está configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY faltantes)."
        )
    return config.SUPABASE_URL.rstrip("/")


def _cabeceras_supabase(tipo_mime: str | None = None) -> dict:
    cabeceras = {
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
        "apikey": config.SUPABASE_SERVICE_KEY,
    }
    if tipo_mime:
        cabeceras["Content-Type"] = tipo_mime
    return cabeceras


def _crear_bucket_supabase(base: str, bucket: str, reglas: ReglasBucket) -> None:
    """Crea un bucket público. Solo se llama si Supabase dice que no existe."""
    tipos = sorted({t for ts in reglas.extensiones.values() for t in ts})
    try:
        creado = requests.post(
            f"{base}/storage/v1/bucket",
            headers=_cabeceras_supabase("application/json"),
            json={
                "id": bucket,
                "name": bucket,
                "public": True,
                "file_size_limit": reglas.max_bytes,
                "allowed_mime_types": tipos,
            },
            timeout=20,
        )
    except requests.exceptions.RequestException as exc:
        raise ErrorAlmacenamiento(f"No se pudo conectar con Supabase para crear el bucket {bucket}.") from exc
    # 400/409 con "already exists": el bucket ya existe, no es un error real.
    if creado.status_code in (200, 201):
        return
    texto = creado.text.lower()
    if creado.status_code in (400, 409) and any(m in texto for m in ("already exists", "duplicate", "ya existe")):
        return
    if creado.status_code in (401, 403):
        raise ErrorAlmacenamiento(
            "La clave SUPABASE_SERVICE_KEY configurada no tiene permisos para crear el bucket "
            f"{bucket}. Debe utilizarse la clave service_role."
        )
    raise ErrorAlmacenamiento(f"No se pudo crear el bucket {bucket} en Supabase ({creado.status_code}).")


def _subir_supabase(bucket: str, nombre: str, datos, tipo_mime: str, reglas: ReglasBucket,
                    timeout, tamano: int | None = None) -> str:
    base = _base_supabase()
    cabeceras = _cabeceras_supabase(tipo_mime)
    if tamano is not None:
        cabeceras["Content-Length"] = str(tamano)

    def enviar():
        if hasattr(datos, "seek"):
            datos.seek(0)
        return requests.post(f"{base}/storage/v1/object/{bucket}/{nombre}", headers=cabeceras, data=datos, timeout=timeout)

    try:
        respuesta = enviar()
        # Solo en buckets marcados: si Supabase no encuentra el bucket, se crea y se reintenta.
        if reglas.crear_si_falta and respuesta.status_code in (400, 404) and "bucket" in respuesta.text.lower():
            _crear_bucket_supabase(base, bucket, reglas)
            respuesta = enviar()
    except requests.exceptions.RequestException as exc:
        raise ErrorAlmacenamiento("No se pudo conectar con Supabase Storage.") from exc

    if respuesta.status_code not in (200, 201):
        if respuesta.status_code in (401, 403):
            raise ErrorAlmacenamiento(
                "Supabase rechazó la carga. Verifica que SUPABASE_SERVICE_KEY sea la clave "
                "service_role del mismo proyecto."
            )
        raise ErrorAlmacenamiento(f"Supabase Storage respondió {respuesta.status_code}: {respuesta.text[:300]}")
    return f"{base}/storage/v1/object/public/{bucket}/{nombre}"


# --- Interfaz pública ---

def verificar_configuracion() -> None:
    """Lanza AlmacenamientoNoConfigurado si faltan las variables del proveedor actual."""
    if es_local():
        raiz_local()
    else:
        _base_supabase()


def url_publica(bucket: str, nombre: str) -> str:
    """URL con la que el navegador abre el archivo (relativa en modo local)."""
    validar(bucket, nombre)
    if es_local():
        return _url_local(bucket, nombre)
    return f"{_base_supabase()}/storage/v1/object/public/{bucket}/{nombre}"


def prefijo_publico(bucket: str) -> str | None:
    """
    Prefijo de las URLs públicas del bucket. None si el proveedor supabase no
    tiene SUPABASE_URL (antes, en ese caso, no se validaba el prefijo).
    """
    if es_local():
        return f"{config.ARCHIVOS_URL_BASE.rstrip('/')}/{bucket}/"
    if not config.SUPABASE_URL:
        return None
    return f"{config.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{bucket}/"


def nombre_desde_url(bucket: str, url: str | None) -> str | None:
    """
    Nombre del archivo si la URL pertenece al bucket con el proveedor actual,
    o None si es de otro sitio o el nombre no es válido. Así nunca se lee ni
    borra nada fuera de nuestro almacenamiento.
    """
    prefijo = prefijo_publico(bucket)
    if not url or not prefijo or not url.startswith(prefijo):
        return None
    nombre = url[len(prefijo):]
    try:
        validar(bucket, nombre)
    except ArchivoInvalido:
        return None
    return nombre


def subir(bucket: str, nombre: str, contenido: bytes, tipo_mime: str, timeout: float | tuple = 30) -> str:
    """Guarda bytes en el bucket y devuelve la URL pública."""
    reglas = validar(bucket, nombre, tipo_mime, len(contenido))
    if es_local():
        destino = _ruta_local(bucket, nombre)
        _asegurar_carpeta(bucket)
        _escribir_atomico(destino, lambda salida: salida.write(contenido))
        return _url_local(bucket, nombre)
    return _subir_supabase(bucket, nombre, contenido, tipo_mime, reglas, timeout)


def subir_archivo(bucket: str, nombre: str, ruta_local: str | os.PathLike, tipo_mime: str,
                  timeout: float | tuple = 30) -> str:
    """Guarda un archivo del disco (sin cargarlo entero en memoria) y devuelve la URL pública."""
    origen = Path(ruta_local)
    tamano = origen.stat().st_size
    reglas = validar(bucket, nombre, tipo_mime, tamano)
    if es_local():
        destino = _ruta_local(bucket, nombre)
        _asegurar_carpeta(bucket)

        def copiar(salida):
            with open(origen, "rb") as entrada:
                shutil.copyfileobj(entrada, salida, 1024 * 1024)

        _escribir_atomico(destino, copiar)
        return _url_local(bucket, nombre)
    with open(origen, "rb") as entrada:
        return _subir_supabase(bucket, nombre, entrada, tipo_mime, reglas, timeout, tamano=tamano)


def leer(bucket: str, nombre: str, timeout: float = 45) -> bytes:
    """Contenido del archivo. En supabase lo descarga de su URL pública, como antes."""
    reglas = validar(bucket, nombre)
    if es_local():
        ruta = _ruta_local(bucket, nombre)
        if not ruta.is_file():
            raise ArchivoNoEncontrado()
        if ruta.stat().st_size > reglas.max_bytes:
            raise ArchivoInvalido("El archivo guardado supera el tamaño máximo del bucket.")
        return ruta.read_bytes()
    url = f"{_base_supabase()}/storage/v1/object/public/{bucket}/{nombre}"
    try:
        respuesta = requests.get(url, timeout=timeout)
    except requests.exceptions.RequestException as exc:
        raise ErrorAlmacenamiento("No se pudo conectar con Supabase Storage.") from exc
    if respuesta.status_code != 200:
        raise ErrorAlmacenamiento(f"No se pudo descargar el archivo (HTTP {respuesta.status_code}).")
    return respuesta.content


def borrar(bucket: str, nombre: str, timeout: float = 20) -> None:
    """Borra el archivo. Si no existe no hace nada. Lanza ErrorAlmacenamiento si falla."""
    validar(bucket, nombre)
    if es_local():
        try:
            _ruta_local(bucket, nombre).unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            raise ErrorAlmacenamiento(f"No se pudo borrar {bucket}/{nombre}: {exc.strerror}") from exc
        return
    try:
        requests.delete(
            f"{_base_supabase()}/storage/v1/object/{bucket}/{nombre}",
            headers=_cabeceras_supabase(),
            timeout=timeout,
        )
    except requests.exceptions.RequestException as exc:
        raise ErrorAlmacenamiento(f"No se pudo borrar {bucket}/{nombre} de Supabase.") from exc


def borrar_sin_fallar(bucket: str, nombre: str | None) -> None:
    """Best-effort: borra y solo registra un aviso si falla. Nunca lanza."""
    if not nombre:
        return
    try:
        borrar(bucket, nombre)
    except AlmacenamientoNoConfigurado:
        return
    except Exception:
        logger.warning("No se pudo borrar del almacenamiento: %s/%s", bucket, nombre, exc_info=True)
