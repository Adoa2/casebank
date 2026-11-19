-- =============================================================================
-- Migración: tabla de trabajos de generación de videos con IA
-- =============================================================================
-- INSTRUCCIONES DE USO:
--   1. NO se ejecuta automáticamente: el backend excluye esta tabla de
--      Base.metadata.create_all (models.TABLAS_SOLO_MIGRACION).
--   2. Ejecutar en Supabase -> SQL Editor solo cuando se vaya a activar
--      VIDEO_IA_HABILITADO=true.
--   3. Es idempotente en la creación (IF NOT EXISTS). No elimina ninguna tabla.
--   4. Requiere las tablas usuarios y videos (sql/migracion_normalizacion.sql).
--   5. Activa Row Level Security sin políticas (ver Paso 3).
-- =============================================================================

BEGIN;

-- Paso 1: Tabla de trabajos.
CREATE TABLE IF NOT EXISTS trabajos_generacion_video (
    id                          SERIAL                      NOT NULL PRIMARY KEY,
    titulo                      character varying           NOT NULL,
    descripcion_inconveniente   text                        NOT NULL,
    pasos                       jsonb                       NOT NULL,
    puntos_a_considerar         text,
    guion                       jsonb,
    estado                      character varying           NOT NULL DEFAULT 'pendiente',
    etapa                       character varying,
    proveedor                   character varying           NOT NULL,
    render_id_externo           character varying,
    recursos_externos           jsonb                       NOT NULL DEFAULT '[]'::jsonb,
    resolucion                  character varying           NOT NULL DEFAULT '1080p',
    caracteres_narracion        integer,
    duracion_estimada_segundos  numeric(7, 2),
    duracion_segundos           numeric(7, 2),
    costo_estimado_usd          numeric(10, 4),
    enlace                      character varying,
    mensaje_error               text,
    video_id                    integer                     REFERENCES videos(id) ON DELETE SET NULL,
    creado_por                  integer                     NOT NULL REFERENCES usuarios(id),
    creado_en                   timestamp without time zone NOT NULL DEFAULT now(),
    actualizado_en              timestamp without time zone NOT NULL DEFAULT now(),
    completado_en               timestamp without time zone,

    CONSTRAINT ck_trabajos_video_estado CHECK (estado IN (
        'pendiente', 'procesando', 'descarga_pendiente', 'completado', 'fallido', 'cancelado'
    )),
    CONSTRAINT ck_trabajos_video_etapa CHECK (etapa IS NULL OR etapa IN (
        'guion', 'voz', 'render', 'descarga'
    )),
    -- Calidad fija: 4K no se permite (cuesta 1,5 veces más).
    CONSTRAINT ck_trabajos_video_resolucion CHECK (resolucion = '1080p'),
    -- Duración máxima de 5 minutos. La estimada se controla en 300 s; la real
    -- (la que informa el proveedor) tiene 30 s de tolerancia porque el render
    -- puede agregar algo de cola (en la prueba sumó 0,5 s).
    CONSTRAINT ck_trabajos_video_duracion_estimada CHECK (
        duracion_estimada_segundos IS NULL OR duracion_estimada_segundos <= 300
    ),
    CONSTRAINT ck_trabajos_video_duracion CHECK (
        duracion_segundos IS NULL OR duracion_segundos <= 330
    ),
    CONSTRAINT ck_trabajos_video_costo CHECK (costo_estimado_usd IS NULL OR costo_estimado_usd >= 0),
    -- Un trabajo crea como máximo un video del manual.
    CONSTRAINT uq_trabajos_video_video_id UNIQUE (video_id),
    -- Un id de render del proveedor pertenece a un solo trabajo.
    CONSTRAINT uq_trabajos_video_render_externo UNIQUE (proveedor, render_id_externo)
);

-- Paso 2: Índices.
-- Un solo trabajo activo por usuario, garantizado por la base de datos
-- (incluso con peticiones simultáneas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_trabajos_video_activo_por_usuario
    ON trabajos_generacion_video (creado_por)
    WHERE estado IN ('pendiente', 'procesando');

-- Conteo de trabajos por usuario y día (límite diario).
CREATE INDEX IF NOT EXISTS idx_trabajos_video_creado_por_creado_en
    ON trabajos_generacion_video (creado_por, creado_en);

-- Búsqueda de trabajos activos vencidos (tiempo límite de 15 minutos).
CREATE INDEX IF NOT EXISTS idx_trabajos_video_estado_creado_en
    ON trabajos_generacion_video (estado, creado_en);

-- Paso 3: Row Level Security.
-- El backend se conecta con el rol postgres (DATABASE_URL), que es dueño de la
-- tabla y no está sujeto a RLS, así que su acceso no cambia. No se crean
-- políticas a propósito: sin políticas, los roles anon y authenticated de la
-- API pública de Supabase no pueden leer ni escribir esta tabla.
ALTER TABLE trabajos_generacion_video ENABLE ROW LEVEL SECURITY;

COMMIT;
