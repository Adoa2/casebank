from fastapi import FastAPI, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware

from .database import models
from .database.db import engine
from .database.db import ensure_schema_columns
from .routers import auth, chat, manual, admin_users, errors, videos, updates

models.Base.metadata.create_all(bind=engine)
ensure_schema_columns()

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
        "description": "Consultas en lenguaje natural sobre el manual, usando RAG con Gemini y pgvector.",
    },
    {
        "name": "Administración de usuarios",
        "description": "CRUD de usuarios del sistema. Requiere privilegio de administrador.",
    },
    {
        "name": "Errores frecuentes",
        "description": "Registro y aprobación de errores frecuentes para que la IA los use al responder.",
    },
    {
        "name": "Videos formativos",
        "description": "CRUD de videos formativos vinculados a secciones del manual. Requiere privilegio mayor.",
    },
    {
        "name": "Actualizaciones",
        "description": "Administracion e indexacion de documentos PDF. Requiere privilegio mayor.",
    },
]

app = FastAPI(
    title="Manual Interactivo CaseBank API",
    description="API para el sistema de manual interactivo con autenticación de usuarios "
                "y asistente de IA (RAG).",
    version="1.0.0",
    openapi_tags=tags_metadata,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
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
api_router.include_router(admin_users.router)
api_router.include_router(errors.router)
api_router.include_router(videos.router)
api_router.include_router(updates.router)

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
