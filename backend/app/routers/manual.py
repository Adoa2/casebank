# app/routers/manual.py
import json
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import auth
from ..database import models

router = APIRouter(prefix="/manual", tags=["Manual"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# app/routers -> app -> backend -> data
JSON_PATH = os.path.join(BASE_DIR, "..", "..", "data", "manual_structure.json")
IMAGES_DIR = os.path.join(BASE_DIR, "..", "..", "data", "extracted_assets")


class SeccionManual(BaseModel):
    id: int = Field(..., description="Identificador secuencial de la seccion.")
    nivel: int = Field(..., description="Nivel de jerarquia (1 = capitulo, hasta 4 = subseccion mas profunda).")
    titulo: str = Field(..., description="Titulo de la seccion tal como aparece en el manual.")
    pagina_inicio: int = Field(..., description="Pagina del PDF donde inicia esta seccion.")
    pagina_fin: int = Field(..., description="Pagina del PDF donde termina esta seccion.")
    contenido: str = Field(..., description="Texto extraido de esta seccion del manual.")
    imagenes: List[str] = Field(default_factory=list, description="Nombres de archivo de las imagenes de esta seccion.")


@router.get(
    "",
    response_model=List[SeccionManual],
    summary="Obtener estructura completa del manual",
    description="Devuelve todas las secciones del manual (capitulos, subcapitulos, etc.) "
                "tal como fueron extraidas del PDF en la Fase 3, para que el frontend arme "
                "el indice lateral y muestre el contenido de cada seccion.",
    response_description="Lista completa de secciones del manual, en el orden del documento original.",
)
def obtener_manual(current_user: models.User = Depends(auth.get_current_user)):
    if not os.path.exists(JSON_PATH):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se encontro el manual procesado (manual_structure.json).",
        )

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        secciones = json.load(f)

    return secciones


@router.get(
    "/imagenes/{nombre_archivo}",
    summary="Obtener una imagen del manual",
    description="Sirve un archivo de imagen extraido del PDF (iconos, capturas de pantalla), "
                "identificado por su nombre exacto, tal como aparece en el campo 'imagenes' "
                "de cada seccion (ej. pagina_87_icono_0.png).",
    response_description="Archivo de imagen solicitado.",
)
def obtener_imagen(
    nombre_archivo: str,
    current_user: models.User = Depends(auth.get_current_user),
):
    # Seguridad: os.path.basename descarta cualquier intento de path traversal
    # (ej. "../../config.py"), quedandose solo con el nombre de archivo simple.
    nombre_seguro = os.path.basename(nombre_archivo)
    if nombre_seguro != nombre_archivo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nombre de archivo invalido.",
        )

    ruta_imagen = os.path.join(IMAGES_DIR, nombre_seguro)
    if not os.path.isfile(ruta_imagen):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Imagen no encontrada.",
        )

    return FileResponse(ruta_imagen)