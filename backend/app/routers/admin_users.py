from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import models, db
from .. import schemas
from . import auth

router = APIRouter(prefix="/admin/users", tags=["Administración de usuarios"])


@router.get(
    "",
    response_model=List[schemas.UserAdminResponse],
    summary="Listar usuarios",
    description="Devuelve todos los usuarios del sistema. Requiere privilegio de administrador.",
)
def listar_usuarios(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    return db_session.query(models.User).order_by(models.User.id).all()


@router.post(
    "",
    response_model=schemas.UserAdminResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear usuario",
    description="Crea un usuario desde el panel administrativo, con rol y estado definidos.",
)
def crear_usuario(
    data: schemas.UserAdminCreate,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    existe = db_session.query(models.User).filter(
        (func.lower(models.User.email) == data.email.lower())
        | (func.lower(models.User.username) == data.username.lower())
    ).first()
    if existe:
        raise HTTPException(status_code=400, detail="El usuario o correo ya está registrado")

    nuevo = models.User(
        username=data.username,
        email=data.email,
        hashed_password=auth.get_password_hash(data.password),
        role=data.role,
        is_active=data.is_active,
    )
    db_session.add(nuevo)
    db_session.commit()
    db_session.refresh(nuevo)
    return nuevo


@router.put(
    "/{user_id}",
    response_model=schemas.UserAdminResponse,
    summary="Actualizar usuario",
    description="Actualiza correo, rol, estado o contraseña de un usuario existente.",
)
def actualizar_usuario(
    user_id: int,
    data: schemas.UserAdminUpdate,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    usuario = db_session.query(models.User).filter(models.User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if data.email is not None:
        usuario.email = data.email
    if data.role is not None:
        usuario.role = data.role
    if data.is_active is not None:
        usuario.is_active = data.is_active
    if data.password:
        usuario.hashed_password = auth.get_password_hash(data.password)

    db_session.commit()
    db_session.refresh(usuario)
    return usuario


@router.delete(
    "/{user_id}",
    response_model=schemas.MessageResponse,
    summary="Eliminar usuario",
    description="Elimina un usuario del sistema. No permite auto-eliminarse.",
)
def eliminar_usuario(
    user_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")

    usuario = db_session.query(models.User).filter(models.User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    db_session.delete(usuario)
    db_session.commit()
    return {"message": "Usuario eliminado correctamente"}