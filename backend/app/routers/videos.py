from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import models, db
from .. import schemas
from . import auth

router = APIRouter(prefix="/videos", tags=["Videos formativos"])


@router.post(
    "",
    response_model=schemas.VideoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar video formativo",
    description="Crea un nuevo video formativo vinculado a una seccion del manual. "
                "Requiere privilegio mayor.",
)
def crear_video(
    data: schemas.VideoCreate,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    nuevo = models.Video(**data.model_dump(), created_by=current_user.id)
    db_session.add(nuevo)
    db_session.commit()
    db_session.refresh(nuevo)
    return nuevo


@router.get(
    "",
    response_model=List[schemas.VideoResponse],
    summary="Listar todos los videos formativos",
    description="Devuelve todos los videos registrados, para el panel administrativo. "
                "Requiere privilegio mayor.",
)
def listar_videos(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    return db_session.query(models.Video).order_by(models.Video.created_at.desc()).all()


@router.get(
    "/por-seccion/{seccion_id}",
    response_model=List[schemas.VideoResponse],
    summary="Listar videos de una seccion del manual",
    description="Devuelve los videos formativos vinculados a una seccion especifica del manual. "
                "Accesible para cualquier usuario autenticado.",
)
def listar_videos_por_seccion(
    seccion_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return db_session.query(models.Video).filter(
        models.Video.seccion_id == seccion_id
    ).order_by(models.Video.created_at.asc()).all()


@router.put(
    "/{video_id}",
    response_model=schemas.VideoResponse,
    summary="Editar video formativo",
    description="Edita los datos de un video existente. Requiere privilegio mayor.",
)
def editar_video(
    video_id: int,
    data: schemas.VideoUpdate,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    video = db_session.query(models.Video).filter(models.Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video no encontrado")

    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(video, campo, valor)

    db_session.commit()
    db_session.refresh(video)
    return video


@router.delete(
    "/{video_id}",
    response_model=schemas.MessageResponse,
    summary="Eliminar video formativo",
    description="Elimina un video formativo. Requiere privilegio mayor.",
)
def eliminar_video(
    video_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_reviewer),
):
    video = db_session.query(models.Video).filter(models.Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video no encontrado")

    db_session.delete(video)
    db_session.commit()
    return {"message": "Video eliminado correctamente"}