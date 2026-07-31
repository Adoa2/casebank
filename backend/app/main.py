from fastapi import FastAPI, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware

from .database import models
from .database.db import engine
from .routers import auth, chat, manual

models.Base.metadata.create_all(bind=engine)

tags_metadata = [
    {
        "name": "Autenticación",
        "description": "Registro, inicio de sesión y recuperación de contraseña.",
    },
    {
        "name": "Manual",
        "description": "Estructura y contenido del manual, extraidos del PDF original.",
    },
    {
        "name": "Asistente IA",
        "description": "Consultas en lenguaje natural sobre el manual, usando RAG con Ollama y ChromaDB.",
    },
]

app = FastAPI(
    title="Manual Interactivo CaseBank API",
    description="API para el sistema de manual interactivo con autenticación de usuarios "
                "y asistente de IA local (RAG).",
    version="1.0.0",
    openapi_tags=tags_metadata,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(manual.router)
api_router.include_router(chat.router)

@api_router.get(
    "/",
    summary="Estado del servidor",
    description="Endpoint simple para confirmar que el backend está en línea y conectado a la base de datos.",
    tags=["General"],
)
def read_root():
    return {"mensaje": "¡Servidor funcionando y base de datos conectada con éxito!"}

@api_router.get(
    "/manual-secreto",
    summary="Zona protegida de prueba",
    description="Endpoint de ejemplo protegido por autenticación.",
    tags=["General"],
)
def read_secret_manual(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "mensaje": f"¡Hola, {current_user.username}! Has entrado a la zona protegida.",
    }

app.include_router(api_router)