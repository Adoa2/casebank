# CRUD de usuarios del sistema accesible solo para administradores.
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
    """Devuelve todos los usuarios ordenados por id."""
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
    """Crea un usuario verificando unicidad de correo y nombre de usuario."""
    existe = db_session.query(models.User).filter(
        (func.lower(models.User.correo) == data.correo.lower())
        | (func.lower(models.User.nombre_usuario) == data.nombre_usuario.lower())
    ).first()
    if existe:
        raise HTTPException(status_code=400, detail="El usuario o correo ya está registrado")

    nuevo = models.User(
        nombre_usuario=data.nombre_usuario,
        correo=data.correo,
        nacionalidad=data.nacionalidad,
        contrasena_hash=auth.get_password_hash(data.contrasena),
        rol=data.rol,
        activo=data.activo,
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
    """Actualiza solo los campos provistos (correo, rol, estado, contraseña)."""
    usuario = db_session.query(models.User).filter(models.User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if data.correo is not None:
        usuario.correo = data.correo
    if data.nacionalidad is not None:
        usuario.nacionalidad = data.nacionalidad
    if data.rol is not None:
        usuario.rol = data.rol
    if data.activo is not None:
        usuario.activo = data.activo
    if data.contrasena:
        usuario.contrasena_hash = auth.get_password_hash(data.contrasena)

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
    """Elimina un usuario. Impide que el admin se elimine a sí mismo."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")

    usuario = db_session.query(models.User).filter(models.User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    db_session.delete(usuario)
    db_session.commit()
    return {"mensaje": "Usuario eliminado correctamente"}
