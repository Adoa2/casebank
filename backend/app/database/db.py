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
    """Agrega columnas nuevas en instalaciones existentes sin un migrador formal."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "nationality" not in user_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN nationality VARCHAR"))

    # Los documentos se crean con SQLAlchemy; los fragmentos usan el tipo vector
    # nativo de PostgreSQL y por eso se inicializan con SQL.
    if "update_documents" in inspect(engine).get_table_names():
        update_columns = {
            column["name"] for column in inspect(engine).get_columns("update_documents")
        }
        with engine.begin() as connection:
            for column_name, column_type in (
                ("seccion_id", "INTEGER"),
                ("capitulo", "VARCHAR"),
                ("seccion", "VARCHAR"),
                ("subseccion", "VARCHAR"),
            ):
                if column_name not in update_columns:
                    connection.execute(text(
                        f"ALTER TABLE update_documents ADD COLUMN {column_name} {column_type}"
                    ))
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS update_chunks (
                    id SERIAL PRIMARY KEY,
                    update_id INTEGER NOT NULL REFERENCES update_documents(id) ON DELETE CASCADE,
                    contenido TEXT NOT NULL,
                    pagina_inicio INTEGER,
                    pagina_fin INTEGER,
                    embedding vector(768) NOT NULL
                )
            """))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_update_chunks_update_id ON update_chunks(update_id)"
            ))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
