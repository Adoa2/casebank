# Conexión a la base de datos y dependencia de sesión para FastAPI.
# Incluye la creación manual de las tablas pgvector que SQLAlchemy no puede generar automáticamente.
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("DATABASE_URL no está configurada. Revisa tu archivo .env")

engine = create_engine(SQLALCHEMY_DATABASE_URL, poolclass=NullPool)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_schema_columns():
    """Crea las tablas pgvector (fragmentos_manual, fragmentos_errores, fragmentos_actualizacion)
    si no existen. Las tablas SQLAlchemy las crea Base.metadata.create_all en main.py."""
    if "documentos_actualizacion" not in inspect(engine).get_table_names():
        return

    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS fragmentos_actualizacion (
                id SERIAL PRIMARY KEY,
                actualizacion_id INTEGER NOT NULL
                    REFERENCES documentos_actualizacion(id) ON DELETE CASCADE,
                contenido TEXT NOT NULL,
                pagina_inicio INTEGER,
                pagina_fin INTEGER,
                embedding vector(768) NOT NULL
            )
        """))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_fragmentos_actualizacion_actualizacion_id "
            "ON fragmentos_actualizacion(actualizacion_id)"
        ))


def get_db():
    """Dependencia de FastAPI que provee y cierra una sesión de base de datos por request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
