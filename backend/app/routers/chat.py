# app/routers/chat.py
from typing import List, Literal, Optional

import psycopg2
import requests
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from . import auth
from ..database import models
from ..services.rag_query import answer_question

router = APIRouter(prefix="/chat", tags=["Asistente IA"])


class ContextoErrorConfirmacion(BaseModel):
    """
    Estado del flujo de confirmacion con evidencia ("¿es este tu error?").
    El frontend reenvia exactamente el bloque pendiente_confirmacion que
    recibio en la respuesta anterior, junto con la decision del usuario en
    el campo 'confirmacion' de ChatQuery.
    """
    pregunta_original: str = Field(..., description="Pregunta original del usuario que origino la confirmacion.")
    error_id_actual: int = Field(..., description="ID del error que se esta confirmando en este turno.")
    candidatos_restantes: List[int] = Field(
        default_factory=list,
        description="IDs de otros errores con evidencia que se probarian si el usuario dice que no es este.",
    )
    intento: int = Field(1, description="Numero de intento de confirmacion actual (maximo 2).")


class MensajeHistorial(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(..., min_length=1, max_length=1200)


class ChatQuery(BaseModel):
    pregunta: str = Field(
        ...,
        min_length=3,
        max_length=500,
        example="¿Cómo ingreso un estado financiero de un afiliado?",
        description="Pregunta en lenguaje natural sobre el uso del sistema CaseBank.",
    )
    contexto_error: Optional[ContextoErrorConfirmacion] = Field(
        None,
        description="Presente solo cuando el usuario esta respondiendo a una confirmacion "
                    "de evidencia pendiente ('¿es este tu error?').",
    )
    confirmacion: Optional[bool] = Field(
        None,
        description="True si el usuario confirmo que el error mostrado es el suyo, False si no. "
                    "Solo se usa junto con contexto_error.",
    )
    historial: List[MensajeHistorial] = Field(
        default_factory=list,
        max_length=8,
        description="Mensajes recientes usados para interpretar preguntas de seguimiento.",
    )


class FuenteManual(BaseModel):
    seccion_id: Optional[int] = Field(
        None,
        description="ID de la seccion del manual (coincide con el id devuelto por GET /api/manual), "
                    "usado por el frontend para enlazar la fuente con el indice lateral. "
                    "Es None cuando la fuente proviene de un error frecuente aprobado.",
    )
    titulo: str = Field(..., description="Titulo de la seccion del manual, o descripcion de la fuente si es un error.")
    pagina: Optional[int] = Field(
        None,
        description="Numero de pagina donde inicia esa seccion en el manual. Es None si la fuente es un error.",
    )
    pagina_fin: Optional[int] = Field(
        None,
        description="Numero de pagina donde termina esa seccion en el manual. Es None si la fuente es un error "
                    "o si la seccion ocupa una sola pagina.",
    )
    url: Optional[str] = Field(None, description="URL del PDF cuando la fuente es una actualización.")
    tipo: Optional[str] = Field(None, description="Origen de la fuente: manual o actualización.")


class PendienteConfirmacionResponse(BaseModel):
    """Se incluye cuando Casey necesita que el usuario confirme si una imagen corresponde a su error."""
    pregunta_original: str
    error_id_actual: int
    candidatos_restantes: List[int]
    intento: int


class ChatRespuesta(BaseModel):
    respuesta: str = Field(..., description="Respuesta generada por el asistente en lenguaje natural.")
    fuentes: List[FuenteManual] = Field(..., description="Secciones del manual usadas para construir la respuesta.")
    imagenes: List[str] = Field(..., description="Nombres de archivo de las imagenes relacionadas con la respuesta.")
    imagen_evidencia: Optional[str] = Field(
        None,
        description="URL de la imagen de evidencia de un error frecuente, cuando se esta pidiendo "
                    "confirmacion al usuario ('¿es este tu error?').",
    )
    pendiente_confirmacion: Optional[PendienteConfirmacionResponse] = Field(
        None,
        description="Presente si la respuesta requiere que el usuario confirme (Si/No) si el error "
                    "mostrado es el suyo. El frontend debe reenviar este bloque tal cual en el "
                    "siguiente mensaje, junto con el campo confirmacion.",
    )
    opciones_aclaracion: List[str] = Field(
        default_factory=list,
        description="Opciones sugeridas cuando la pregunta admite varias interpretaciones.",
    )
    sugerir_soporte: bool = Field(
        False,
        description="Indica que el chat debe mostrar un acceso para crear un ticket de soporte.",
    )


# --- RUTAS ---
@router.post(
    "",
    response_model=ChatRespuesta,
    summary="Consultar al asistente del manual",
    description="Recibe una pregunta en lenguaje natural sobre el sistema CaseBank y responde "
                "usando busqueda semantica (RAG) sobre el manual, con embeddings y generacion via Gemini. "
                "Tambien resuelve el flujo de confirmacion de errores frecuentes con evidencia (imagen).",
    response_description="Respuesta generada junto con las fuentes e imagenes relacionadas del manual.",
)
def chat_con_manual(
    data: ChatQuery,
    current_user: models.User = Depends(auth.get_current_user),
):
    try:
        contexto = data.contexto_error.model_dump() if data.contexto_error else None
        historial = [mensaje.model_dump() for mensaje in data.historial]
        resultado = answer_question(
            data.pregunta,
            contexto_error=contexto,
            confirmacion=data.confirmacion,
            historial=historial,
            nationality=current_user.nationality,
        )
    except RuntimeError:
        # rag_query.py agoto los reintentos por rate limit (429) de Gemini
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El asistente de IA esta recibiendo demasiadas solicitudes en este momento. "
                   "Intenta de nuevo en unos segundos.",
        )
    except requests.exceptions.RequestException:
        # Fallo de red hacia la API de Gemini, o la API respondio con error
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
