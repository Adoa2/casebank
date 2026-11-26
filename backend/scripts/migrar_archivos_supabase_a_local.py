"""
Copia todos los objetos de los 4 buckets de Supabase Storage a ARCHIVOS_DIR.

ORDEN DE LA MIGRACIÓN A ALMACENAMIENTO LOCAL (no lo cambies):
  1. Copiar archivos   -> este script (primero con --dry-run).
  2. Migrar URLs       -> sql/migrar_urls_almacenamiento.sql.
  3. Cambiar proveedor -> ALMACENAMIENTO_PROVEEDOR=local en backend/.env y reiniciar.

  ADVERTENCIA: si cambias el proveedor antes de migrar las URLs, los trabajos
  de video con IA cuyas capturas (pasos[].imagen_url) siguen apuntando a
  Supabase fallarán en la etapa de render ("La captura no pertenece al bucket
  de capturas"), y no se podrán borrar sus mp4. Haz la migración con el
  backend detenido o sin trabajos de video en curso; si alguien sube archivos
  entre el paso 1 y el 3, vuelve a ejecutar este script (es reanudable) antes
  del paso 2.

Uso (desde backend/, con el venv activo; lee SUPABASE_URL, SUPABASE_SERVICE_KEY
y ARCHIVOS_DIR de backend/.env o del entorno):

    python scripts/migrar_archivos_supabase_a_local.py --dry-run
    python scripts/migrar_archivos_supabase_a_local.py
    python scripts/migrar_archivos_supabase_a_local.py --bucket actualizaciones-pdf

Reanudable: si el archivo ya existe en disco con el mismo tamaño se omite.
Cada archivo se escribe en un temporal y se renombra al terminar, así que una
interrupción no deja archivos a medias. No borra nada en Supabase.
"""

import argparse
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402
from app.services import almacenamiento  # noqa: E402

PAGINA = 1000


def _cabeceras() -> dict:
    return {
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
        "apikey": config.SUPABASE_SERVICE_KEY,
    }


def listar_objetos(base: str, bucket: str, prefijo: str = "") -> list[dict]:
    """Lista recursivamente los objetos del bucket: [{"nombre", "tamano"}]."""
    objetos, desplazamiento = [], 0
    while True:
        respuesta = requests.post(
            f"{base}/storage/v1/object/list/{bucket}",
            headers={**_cabeceras(), "Content-Type": "application/json"},
            json={"prefix": prefijo, "limit": PAGINA, "offset": desplazamiento,
                  "sortBy": {"column": "name", "order": "asc"}},
            timeout=30,
        )
        if respuesta.status_code != 200:
            raise RuntimeError(f"No se pudo listar {bucket}/{prefijo} ({respuesta.status_code}): {respuesta.text[:200]}")
        items = respuesta.json()
        for item in items:
            ruta = f"{prefijo}{item['name']}"
            if item.get("id") is None:  # carpeta
                objetos.extend(listar_objetos(base, bucket, f"{ruta}/"))
            elif item["name"] != ".emptyFolderPlaceholder":
                objetos.append({"nombre": ruta, "tamano": (item.get("metadata") or {}).get("size")})
        if len(items) < PAGINA:
            return objetos
        desplazamiento += PAGINA


def descargar(base: str, bucket: str, nombre: str, destino: Path) -> int:
    """Descarga en streaming a un temporal y lo renombra. Devuelve los bytes escritos."""
    escritos = 0

    def escribir(salida):
        nonlocal escritos
        with requests.get(f"{base}/storage/v1/object/{bucket}/{nombre}", headers=_cabeceras(),
                          stream=True, timeout=(10, 120)) as respuesta:
            if respuesta.status_code != 200:
                raise RuntimeError(f"HTTP {respuesta.status_code}")
            for bloque in respuesta.iter_content(chunk_size=1024 * 1024):
                salida.write(bloque)
                escritos += len(bloque)

    almacenamiento._escribir_atomico(destino, escribir)
    return escritos


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra qué se descargaría.")
    parser.add_argument("--bucket", choices=almacenamiento.buckets(), action="append",
                        help="Limitar a uno o más buckets (por defecto, los 4).")
    args = parser.parse_args()

    try:
        base = almacenamiento._base_supabase()
        raiz = almacenamiento.raiz_local()
    except almacenamiento.ErrorAlmacenamiento as exc:
        print(f"Error de configuración: {exc}", file=sys.stderr)
        return 2
    if not args.dry_run:
        almacenamiento.preparar_carpetas_locales()

    print(f"Origen:  {base} | Destino: {raiz}{'  (DRY-RUN)' if args.dry_run else ''}")
    total = {"descargados": 0, "existentes": 0, "omitidos": 0, "errores": 0, "bytes": 0}
    for bucket in args.bucket or almacenamiento.buckets():
        try:
            objetos = listar_objetos(base, bucket)
        except Exception as exc:
            print(f"[{bucket}] ERROR al listar: {exc}")
            total["errores"] += 1
            continue
        print(f"[{bucket}] {len(objetos)} objetos")
        for obj in objetos:
            nombre, tamano = obj["nombre"], obj["tamano"]
            try:
                almacenamiento.validar(bucket, nombre, tamano=tamano)
                destino = almacenamiento._ruta_local(bucket, nombre)
            except almacenamiento.ArchivoInvalido as exc:
                print(f"  OMITIDO  {nombre}: {exc}")
                total["omitidos"] += 1
                continue
            if destino.exists():
                if tamano is None or destino.stat().st_size == tamano:
                    total["existentes"] += 1
                    continue
                print(f"  DISTINTO {nombre}: en disco {destino.stat().st_size} B, en Supabase {tamano} B; se deja como está")
                total["omitidos"] += 1
                continue
            if args.dry_run:
                print(f"  BAJARÍA  {nombre} ({tamano} B)")
                total["descargados"] += 1
                total["bytes"] += tamano or 0
                continue
            try:
                escritos = descargar(base, bucket, nombre, destino)
            except Exception as exc:
                print(f"  ERROR    {nombre}: {exc}")
                total["errores"] += 1
                continue
            total["descargados"] += 1
            total["bytes"] += escritos

    verbo = "por descargar" if args.dry_run else "descargados"
    print(
        f"\nResumen: {total['descargados']} {verbo} ({total['bytes'] / 1024 / 1024:.1f} MB), "
        f"{total['existentes']} ya existían, {total['omitidos']} omitidos, {total['errores']} errores."
    )
    return 1 if total["errores"] else 0


if __name__ == "__main__":
    sys.exit(main())
