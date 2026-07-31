from fastapi import FastAPI, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware

from .database import models
from .database.db import engine
from .routers import auth

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Manual Interactivo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)

@api_router.get("/")
def read_root():
    return {"mensaje": "¡Servidor funcionando y base de datos conectada con éxito!"}

@api_router.get("/manual-secreto")
def read_secret_manual(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "mensaje": f"¡Hola, {current_user.username}! Has entrado a la zona protegida.",
        "secreto": "Aquí irá el lector de PDF y la IA en las próximas fases."
    }

app.include_router(api_router)