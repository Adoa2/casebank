# app/routers/chat.py
from typing import List

import psycopg2
import requests
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from . import auth
from ..database import models
from ..services.rag_query import answer_question

router = APIRouter(prefix="/chat", tags=["Asistente IA"])


# --- SCHEMAS ---
# Se definen aqui, junto al router, para no tocar schemas.py sin verlo primero.
# Si prefieres tenerlos centralizados junto al resto, se pueden mover a
# schemas.py sin ningun cambio en su contenido.

class ChatQuery(BaseModel):
    pregunta: str = Field(
        ...,
        min_length=3,
        max_length=500,
        example="¿Cómo ingreso un estado financiero de un afiliado?",
        description="Pregunta en lenguaje natural sobre el uso del sistema CaseBank.",
    )


class FuenteManual(BaseModel):
    seccion_id: int = Field(
        ...,
        description="ID de la seccion del manual (coincide con el id devuelto por GET /api/manual), "
                    "usado por el frontend para enlazar la fuente con el indice lateral.",
    )
    titulo: str = Field(..., description="Titulo de la seccion del manual de donde se obtuvo la informacion.")
    pagina: int = Field(..., description="Numero de pagina donde inicia esa seccion en el manual.")


class ChatRespuesta(BaseModel):
    respuesta: str = Field(..., description="Respuesta generada por el asistente en lenguaje natural.")
    fuentes: List[FuenteManual] = Field(..., description="Secciones del manual usadas para construir la respuesta.")
    imagenes: List[str] = Field(..., description="Nombres de archivo de las imagenes relacionadas con la respuesta.")


# --- RUTAS ---
@router.post(
    "",
    response_model=ChatRespuesta,
    summary="Consultar al asistente del manual",
    description="Recibe una pregunta en lenguaje natural sobre el sistema CaseBank y responde "
                "usando busqueda semantica (RAG) sobre el manual, con embeddings y generacion via Gemini.",
    response_description="Respuesta generada junto con las fuentes e imagenes relacionadas del manual.",
)
def chat_con_manual(
    data: ChatQuery,
    current_user: models.User = Depends(auth.get_current_user),
):
    try:
        resultado = answer_question(data.pregunta)
    except RuntimeError:
        # rag_query.py agoto los reintentos por rate limit (429) de Gemini
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El asistente de IA esta recibiendo demasiadas solicitudes en este momento. "
                   "Intenta de nuevo en unos segundos.",
        )
    except requests.exceptions.RequestException:
        # Fallo de red hacia la API de Gemini, o la API respondio con error
        # (por ejemplo, GEMINI_API_KEY invalida o ausente)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El asistente de IA no esta disponible en este momento. Verifica la conexion "
                   "y que GEMINI_API_KEY este configurada correctamente.",
        )
    except psycopg2.errors.UndefinedTable:
        # Ocurre cuando build_vector_db.py todavia no se ha ejecutado
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="El indice del manual no esta disponible todavia. Ejecuta build_vector_db.py primero.",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ocurrio un error inesperado al consultar el asistente.",
        )

    return resultado