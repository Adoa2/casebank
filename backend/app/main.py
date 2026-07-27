# app/main.py
from fastapi import FastAPI, Depends
from .database import models
from .database.db import engine
from .routers import auth
from fastapi.middleware.cors import CORSMiddleware

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Manual Interactivo API")
app.include_router(auth.router)

@app.get("/")
def read_root():
    return {"mensaje": "¡Servidor funcionando y base de datos conectada con éxito!"}

# --- NUEVA RUTA PROTEGIDA ---
@app.get("/manual-secreto")
def read_secret_manual(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "mensaje": f"¡Hola, {current_user.username}! Has entrado a la zona protegida.",
        "secreto": "Aquí irá el lector de PDF y la IA en las próximas fases."
    }

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # en producción, restringe esto a tu dominio real del frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)