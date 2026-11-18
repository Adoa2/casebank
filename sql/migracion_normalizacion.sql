-- =============================================================================
-- Migración: Normalización de nombres de tablas y columnas al español
-- Estrategia: DROP → CREATE (se carga un manual nuevo luego de esto)
-- =============================================================================
-- INSTRUCCIONES DE USO:
--   1. Ejecuta este script completo en Supabase → SQL Editor.
--   2. Reemplaza los valores marcados con <<>> en la sección "Usuario admin".
--   3. Hash de contraseña (bcrypt, igual que auth.py): python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt'], deprecated='auto').hash('TuContrasena'))"
--   4. Después de ejecutar este script, corre build_vector_db.py para
--      re-indexar el manual en fragmentos_manual.
-- =============================================================================

BEGIN;

-- Paso 0: Habilitar pgvector (si no está habilitado)
CREATE EXTENSION IF NOT EXISTS vector;

-- Paso 1: Eliminar tablas antiguas (con nombres en inglés) si aún existen
DROP TABLE IF EXISTS update_chunks              CASCADE;
DROP TABLE IF EXISTS error_chunks               CASCADE;
DROP TABLE IF EXISTS manual_chunks              CASCADE;
DROP TABLE IF EXISTS error_diagnostico_opciones CASCADE;
DROP TABLE IF EXISTS video_generation_jobs      CASCADE;
DROP TABLE IF EXISTS videos                     CASCADE;
DROP TABLE IF EXISTS update_documents           CASCADE;
DROP TABLE IF EXISTS error_reports              CASCADE;
DROP TABLE IF EXISTS password_reset_codes       CASCADE;
DROP TABLE IF EXISTS users                      CASCADE;

-- Paso 2: Eliminar tablas nuevas (con nombres en español) si ya existieran
DROP TABLE IF EXISTS fragmentos_actualizacion        CASCADE;
DROP TABLE IF EXISTS fragmentos_errores              CASCADE;
DROP TABLE IF EXISTS fragmentos_manual               CASCADE;
DROP TABLE IF EXISTS error_diagnostico_opciones      CASCADE;
DROP TABLE IF EXISTS trabajos_generacion_video       CASCADE;
DROP TABLE IF EXISTS video_generation_jobs           CASCADE;
DROP TABLE IF EXISTS videos                          CASCADE;
DROP TABLE IF EXISTS documentos_actualizacion        CASCADE;
DROP TABLE IF EXISTS reportes_errores                CASCADE;
DROP TABLE IF EXISTS codigos_recuperacion_contrasena CASCADE;
DROP TABLE IF EXISTS usuarios                        CASCADE;

-- =============================================================================
-- Paso 3: Crear tablas con nombres en español
-- Tipos, nulabilidad y defaults tomados del esquema real de Supabase
-- =============================================================================

CREATE TABLE usuarios (
    id              SERIAL                   NOT NULL PRIMARY KEY,
    nombre_usuario  character varying        NOT NULL,
    correo          character varying        NOT NULL,
    contrasena_hash character varying        NOT NULL,
    creado_en       timestamp without time zone NOT NULL DEFAULT now(),
    activo          boolean                  NOT NULL DEFAULT true,
    rol             integer                  NOT NULL DEFAULT 0,
    nacionalidad    character varying
);

CREATE UNIQUE INDEX ix_usuarios_nombre_usuario ON usuarios(nombre_usuario);
CREATE UNIQUE INDEX ix_usuarios_correo ON usuarios(correo);

CREATE TABLE codigos_recuperacion_contrasena (
    id          SERIAL                      NOT NULL PRIMARY KEY,
    usuario_id  integer                     NOT NULL REFERENCES usuarios(id),
    codigo      character varying           NOT NULL,
    expira_en   timestamp without time zone NOT NULL,
    usado       boolean,
    creado_en   timestamp without time zone
);

CREATE TABLE reportes_errores (
    id                  SERIAL                      NOT NULL PRIMARY KEY,
    titulo              character varying           NOT NULL,
    modulo              character varying           NOT NULL,
    descripcion         text                        NOT NULL,
    causa               text,
    solucion            text                        NOT NULL,
    procedimiento       text,
    palabras_clave      character varying,
    nivel               character varying,
    estado              character varying           NOT NULL DEFAULT 'pendiente',
    creado_por          integer                     NOT NULL REFERENCES usuarios(id),
    revisado_por        integer                     REFERENCES usuarios(id),
    creado_en           timestamp without time zone NOT NULL DEFAULT now(),
    revisado_en         timestamp without time zone,
    requiere_ticket     boolean                     NOT NULL DEFAULT false,
    tiene_evidencia     boolean                     NOT NULL DEFAULT false,
    imagen_url          text,
    tiene_diagnostico   boolean                     NOT NULL DEFAULT false,
    diagnostico_titulo  text
);

CREATE TABLE error_diagnostico_opciones (
    id          SERIAL            NOT NULL PRIMARY KEY,
    reporte_id  integer           NOT NULL REFERENCES reportes_errores(id) ON DELETE CASCADE,
    pregunta    text              NOT NULL,
    respuesta   text              NOT NULL,
    orden       integer           NOT NULL DEFAULT 0
);

CREATE TABLE videos (
    id          SERIAL                      NOT NULL PRIMARY KEY,
    titulo      character varying           NOT NULL,
    enlace      character varying           NOT NULL,
    seccion_id  integer                     NOT NULL,
    capitulo    character varying           NOT NULL,
    seccion     character varying,
    subseccion  character varying,
    creado_por  integer                     NOT NULL REFERENCES usuarios(id),
    creado_en   timestamp without time zone NOT NULL
);
CREATE INDEX idx_videos_seccion_id ON videos(seccion_id);

CREATE TABLE documentos_actualizacion (
    id                   SERIAL                      NOT NULL PRIMARY KEY,
    titulo               character varying           NOT NULL,
    descripcion          text                        NOT NULL,
    palabras_clave       character varying           NOT NULL,
    aplicabilidad        character varying           NOT NULL,
    archivo_url          character varying           NOT NULL,
    archivo_nombre       character varying           NOT NULL,
    ruta_almacenamiento  character varying           NOT NULL,
    activo               boolean                     NOT NULL,
    creado_por           integer                     NOT NULL REFERENCES usuarios(id),
    creado_en            timestamp without time zone NOT NULL,
    actualizado_en       timestamp without time zone NOT NULL,
    seccion_id           integer,
    capitulo             character varying,
    seccion              character varying,
    subseccion           character varying
);
CREATE INDEX idx_documentos_actualizacion_seccion_id ON documentos_actualizacion(seccion_id);

CREATE TABLE fragmentos_manual (
    id            SERIAL   NOT NULL PRIMARY KEY,
    seccion_id    text     NOT NULL,
    titulo        text,
    nivel         integer,
    pagina_inicio integer,
    pagina_fin    integer,
    contenido     text     NOT NULL,
    imagenes      jsonb,
    embedding     vector(768)
);
CREATE INDEX idx_fragmentos_manual_seccion_id ON fragmentos_manual(seccion_id);

CREATE TABLE fragmentos_errores (
    id          SERIAL      NOT NULL PRIMARY KEY,
    reporte_id  integer     NOT NULL REFERENCES reportes_errores(id) ON DELETE CASCADE,
    contenido   text        NOT NULL,
    embedding   vector(768)
);
CREATE INDEX idx_fragmentos_errores_reporte_id ON fragmentos_errores(reporte_id);

CREATE TABLE fragmentos_actualizacion (
    id               SERIAL      NOT NULL PRIMARY KEY,
    actualizacion_id integer     NOT NULL REFERENCES documentos_actualizacion(id) ON DELETE CASCADE,
    contenido        text        NOT NULL,
    pagina_inicio    integer,
    pagina_fin       integer,
    embedding        vector(768) NOT NULL
);
CREATE INDEX idx_fragmentos_actualizacion_actualizacion_id
    ON fragmentos_actualizacion(actualizacion_id);

-- RLS: igual que en las tablas originales (activo, sin políticas)
ALTER TABLE reportes_errores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_diagnostico_opciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fragmentos_errores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fragmentos_manual           ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Paso 4: Insertar usuario administrador inicial
--
-- Reemplaza los siguientes valores antes de ejecutar:
--   <<ADMIN_NOMBRE_USUARIO>>  : nombre de usuario del admin (ej. 'admin')
--   <<ADMIN_CORREO>>          : correo del admin (ej. 'admin@cooperativa.com')
--   <<ADMIN_CONTRASENA_HASH>> : hash bcrypt generado con passlib (ver instrucciones arriba)
-- =============================================================================

INSERT INTO usuarios (nombre_usuario, correo, nacionalidad, contrasena_hash, activo, rol)
VALUES (
    '<<ADMIN_NOMBRE_USUARIO>>',
    '<<ADMIN_CORREO>>',
    'hondurena',
    '<<ADMIN_CONTRASENA_HASH>>',
    true,
    2
);

COMMIT;
