# Manual CaseBank

Backend FastAPI (`backend/`) y frontend React + Vite (`frontend/`).

## Almacenamiento de archivos

Las imágenes de evidencia de errores, los PDF de actualizaciones, las capturas
de los videos con IA y los mp4 generados se guardan mediante
`backend/app/services/almacenamiento.py`, que tiene dos proveedores:

| Proveedor | Dónde se guardan | URL que se guarda en la base |
|---|---|---|
| `supabase` (por defecto) | Buckets públicos de Supabase Storage | `https://PROYECTO.supabase.co/storage/v1/object/public/<bucket>/<nombre>` |
| `local` | Subcarpetas de `ARCHIVOS_DIR` | `/api/archivos/<bucket>/<nombre>` (relativa) |

Buckets o subcarpetas y sus límites:

| Bucket | Contenido | Máximo |
|---|---|---|
| `error-evidencias` | JPG/PNG | 5 MB |
| `actualizaciones-pdf` | PDF | 15 MB |
| `video-generacion-imagenes` | JPG/PNG | 5 MB |
| `videos-generados` | MP4 | 500 MB |

### Variables (backend/.env)

| Variable | Valor por defecto | Uso |
|---|---|---|
| `ALMACENAMIENTO_PROVEEDOR` | `supabase` | `supabase` o `local`. Un valor distinto impide arrancar. |
| `ARCHIVOS_DIR` | — | Obligatoria en modo local. Carpeta raíz (ej. `/srv/casebank/archivos`). |
| `ARCHIVOS_URL_BASE` | `/api/archivos` | Ruta pública de los archivos en modo local. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | — | Modo supabase y script de migración. |

Ver `backend/.env.example`.

### Cómo funciona el modo local

- Al arrancar se crean `ARCHIVOS_DIR` y las 4 subcarpetas (permisos 750) y se
  monta `ARCHIVOS_URL_BASE` con `StaticFiles`, sin listado de carpetas. Los
  mp4 admiten Range requests (se pueden adelantar).
- Los nombres los genera el servidor (uuid + extensión validada). Se rechaza
  cualquier nombre con `/`, `..`, puntos iniciales o extensiones no permitidas
  y se verifica que la ruta resuelta queda dentro de su carpeta.
- Escritura atómica: temporal oculto `.tmp-*.parcial` en la misma carpeta y
  `rename`. Los archivos quedan con permisos 640. Nunca se pisa un archivo.
- Las imágenes se validan por su firma real (PNG/JPEG), no solo por el tipo
  que declara el navegador.
- Cabeceras de `/api/archivos`: `X-Content-Type-Options: nosniff` siempre;
  `Content-Security-Policy: sandbox` en imágenes y videos (no en PDF, para no
  romper el visor de PDF del navegador).
- Los archivos son públicos para quien conozca la URL, igual que los buckets
  públicos de Supabase; la protección es el nombre aleatorio.
- El servidor lee sus propios archivos del disco (capturas para HeyGen, PDF
  para reindexar), nunca por HTTP.
- HeyGen no necesita URLs públicas: el backend le sube las capturas dentro
  de un zip y descarga el mp4 resultante.
- Las URLs relativas suponen que el frontend y la API están en el mismo
  dominio (o que `VITE_API_BASE_URL` apunta a la API: el reproductor de
  videos la usa para resolverlas).
- El modo local no sirve en Vercel (disco efímero): ahí se mantiene `supabase`.

### Nginx en producción (opcional)

Nginx puede servir `/api/archivos/` directamente sin pasar por Python (Range
incluido). Las `location` con regex tienen prioridad sobre el `location /api/`
que hace proxy a uvicorn; todo lo que no coincida (temporales `.tmp-*`,
carpetas, otros nombres) cae en el 404. **No probado en este repositorio**:
valídalo con `nginx -t` y los `curl` de la guía de prueba.

```nginx
# Imágenes y videos: nosniff + sandbox.
location ~ "^/api/archivos/(error-evidencias|video-generacion-imagenes)/([A-Za-z0-9][A-Za-z0-9_-]{0,127}\.(?:png|jpg))$" {
    alias /srv/casebank/archivos/$1/$2;
    add_header X-Content-Type-Options nosniff always;
    add_header Content-Security-Policy sandbox always;
}
location ~ "^/api/archivos/(videos-generados)/([A-Za-z0-9][A-Za-z0-9_-]{0,127}\.mp4)$" {
    alias /srv/casebank/archivos/$1/$2;
    add_header X-Content-Type-Options nosniff always;
    add_header Content-Security-Policy sandbox always;
}
# PDF: solo nosniff (sandbox rompe el visor de PDF del navegador).
location ~ "^/api/archivos/(actualizaciones-pdf)/([A-Za-z0-9][A-Za-z0-9_-]{0,127}\.pdf)$" {
    alias /srv/casebank/archivos/$1/$2;
    add_header X-Content-Type-Options nosniff always;
}
location /api/archivos/ {
    return 404;
}
```

El usuario de Nginx (`www-data`) necesita permiso de lectura: por ejemplo, grupo
`www-data` en `ARCHIVOS_DIR` con el bit setgid (`chmod 2750`).

### Migrar de Supabase a local

**El orden importa: copiar archivos → migrar URLs → cambiar proveedor.**

> Si cambias el proveedor antes de migrar las URLs, los trabajos de video con
> IA cuyas capturas (`pasos[].imagen_url`) siguen en Supabase fallarán al
> renderizar y sus mp4 no se podrán borrar. Haz la migración con el backend
> detenido o sin trabajos de video en curso.

1. Copiar archivos (reanudable; no borra nada en Supabase):
   ```bash
   cd backend && source venv/bin/activate
   python scripts/migrar_archivos_supabase_a_local.py --dry-run
   python scripts/migrar_archivos_supabase_a_local.py
   ```
2. Migrar URLs. Por defecto solo muestra los cambios y hace ROLLBACK:
   ```bash
   psql "$DATABASE_URL" -f sql/migrar_urls_almacenamiento.sql \
     -v viejo='https://TU-PROYECTO.supabase.co/storage/v1/object/public/' \
     -v nuevo='/api/archivos/'
   # revisar los conteos y repetir con  -v aplicar=1
   ```
   Para revertir, intercambia `viejo` y `nuevo`.
3. Poner `ALMACENAMIENTO_PROVEEDOR=local` y `ARCHIVOS_DIR=...` en `backend/.env` y reiniciar.

### Pruebas

```bash
cd backend && python -m unittest discover -s tests -v   # almacenamiento (sin red ni BD)
cd frontend && npm test                                  # clasificación de enlaces de video
```
