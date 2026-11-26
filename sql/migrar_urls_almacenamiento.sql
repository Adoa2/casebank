-- =============================================================================
-- Migración de URLs de archivos: prefijo de Supabase Storage <-> almacenamiento local
-- =============================================================================
-- ORDEN DE LA MIGRACIÓN A ALMACENAMIENTO LOCAL (no lo cambies):
--   1. Copiar archivos   -> backend/scripts/migrar_archivos_supabase_a_local.py
--   2. Migrar URLs       -> este script.
--   3. Cambiar proveedor -> ALMACENAMIENTO_PROVEEDOR=local y reiniciar el backend.
--
--   ADVERTENCIA: si se cambia el proveedor antes de este paso, los trabajos de
--   video con IA con capturas en Supabase (pasos[].imagen_url) fallan al
--   renderizar. Ejecútalo con el backend detenido o sin trabajos en curso.
--
-- QUÉ CAMBIA: solo el PREFIJO, y solo en los valores que empiezan por :viejo.
-- Los buckets se conservan como subcarpetas, así que un único prefijo cubre
-- los 4 buckets:
--   reportes_errores.imagen_url
--   documentos_actualizacion.archivo_url   (ruta_almacenamiento no cambia)
--   videos.enlace                          (YouTube, Dropbox, etc. no se tocan)
--   trabajos_generacion_video.enlace
--   trabajos_generacion_video.pasos[].imagen_url   (JSONB)
-- No cambia el esquema ni borra filas.
--
-- USO (psql; no funciona en el SQL Editor de Supabase porque usa variables de psql):
--   Vista previa (por defecto NO aplica: hace ROLLBACK):
--     psql "$DATABASE_URL" -f sql/migrar_urls_almacenamiento.sql \
--       -v viejo='https://TU-PROYECTO.supabase.co/storage/v1/object/public/' \
--       -v nuevo='/api/archivos/'
--   Aplicar: lo mismo con  -v aplicar=1
--   Revertir: intercambia viejo y nuevo:
--       -v viejo='/api/archivos/' -v nuevo='https://TU-PROYECTO.supabase.co/storage/v1/object/public/' -v aplicar=1
--
--   :viejo y :nuevo deben terminar en "/". :nuevo debe coincidir con
--   ARCHIVOS_URL_BASE + "/" (por defecto /api/archivos/).
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?viejo}
\else
  \echo 'Falta -v viejo=... (prefijo actual, terminado en /)'
  \quit
\endif
\if :{?nuevo}
\else
  \echo 'Falta -v nuevo=... (prefijo nuevo, terminado en /)'
  \quit
\endif
\if :{?aplicar}
\else
  \set aplicar 0
\endif

SELECT to_regclass('trabajos_generacion_video') IS NOT NULL AS hay_trabajos \gset

\echo 'Prefijo viejo:' :'viejo'
\echo 'Prefijo nuevo:' :'nuevo'

BEGIN;

-- Paso 1: vista previa: cuántas filas cambiarían en cada columna.
\echo '--- Filas que cambiarían ---'
SELECT 'reportes_errores.imagen_url' AS columna, count(*) AS filas
  FROM reportes_errores WHERE starts_with(imagen_url, :'viejo')
UNION ALL
SELECT 'documentos_actualizacion.archivo_url', count(*)
  FROM documentos_actualizacion WHERE starts_with(archivo_url, :'viejo')
UNION ALL
SELECT 'videos.enlace', count(*)
  FROM videos WHERE starts_with(enlace, :'viejo');

\if :hay_trabajos
SELECT 'trabajos_generacion_video.enlace' AS columna, count(*) AS filas
  FROM trabajos_generacion_video WHERE starts_with(enlace, :'viejo')
UNION ALL
SELECT 'trabajos_generacion_video.pasos[].imagen_url (filas)', count(*)
  FROM trabajos_generacion_video t
 WHERE jsonb_typeof(t.pasos) = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.pasos) p WHERE starts_with(p->>'imagen_url', :'viejo'));
\else
\echo 'La tabla trabajos_generacion_video no existe: se omite.'
\endif

-- Paso 2: reemplazo del prefijo.
UPDATE reportes_errores
   SET imagen_url = :'nuevo' || substr(imagen_url, length(:'viejo') + 1)
 WHERE starts_with(imagen_url, :'viejo');

UPDATE documentos_actualizacion
   SET archivo_url = :'nuevo' || substr(archivo_url, length(:'viejo') + 1)
 WHERE starts_with(archivo_url, :'viejo');

UPDATE videos
   SET enlace = :'nuevo' || substr(enlace, length(:'viejo') + 1)
 WHERE starts_with(enlace, :'viejo');

\if :hay_trabajos
UPDATE trabajos_generacion_video
   SET enlace = :'nuevo' || substr(enlace, length(:'viejo') + 1)
 WHERE starts_with(enlace, :'viejo');

-- Reescribe solo imagen_url de cada paso, conservando el orden y los demás campos.
UPDATE trabajos_generacion_video t
   SET pasos = (
       SELECT jsonb_agg(
                CASE WHEN starts_with(e.paso->>'imagen_url', :'viejo')
                     THEN jsonb_set(e.paso, '{imagen_url}',
                                    to_jsonb(:'nuevo' || substr(e.paso->>'imagen_url', length(:'viejo') + 1)))
                     ELSE e.paso END
                ORDER BY e.orden)
         FROM jsonb_array_elements(t.pasos) WITH ORDINALITY AS e(paso, orden))
 WHERE jsonb_typeof(t.pasos) = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.pasos) p WHERE starts_with(p->>'imagen_url', :'viejo'));
\endif

-- Paso 3: comprobación: lo que sigue con el prefijo viejo debe ser 0.
\echo '--- Filas que siguen con el prefijo viejo (debe ser 0) ---'
SELECT (SELECT count(*) FROM reportes_errores WHERE starts_with(imagen_url, :'viejo'))
     + (SELECT count(*) FROM documentos_actualizacion WHERE starts_with(archivo_url, :'viejo'))
     + (SELECT count(*) FROM videos WHERE starts_with(enlace, :'viejo')) AS restantes_sin_trabajos;

\if :aplicar
COMMIT;
\echo 'Cambios APLICADOS.'
\else
ROLLBACK;
\echo 'Vista previa: no se aplicó nada (ROLLBACK). Usa -v aplicar=1 para aplicar.'
\endif
