# app/database/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# Nombre del archivo de la base de datos local
SQLALCHEMY_DATABASE_URL = "sqlite:///./sql_app.db"

# connect_args={"check_same_thread": False} es necesario solo para SQLite en FastAPI
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependencia para obtener la sesión de la base de datos en las rutas
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()