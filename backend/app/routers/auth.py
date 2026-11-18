from datetime import datetime, timedelta
import re
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt

from ..database import models, db
from .. import schemas
from ..config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from ..services.email_service import send_reset_code_email, EmailSendError

router = APIRouter(prefix="/auth", tags=["Autenticación"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


# --- FUNCIONES DE AYUDA ---
def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- RUTAS ---
@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=schemas.UserResponse,
    summary="Registrar nuevo usuario",
    description="Crea una cuenta nueva. El nombre de usuario y el correo deben ser únicos y el correo debe tener un formato válido.",
    response_description="Usuario creado exitosamente.",
)
def register_user(user: schemas.UserCreate, db_session: Session = Depends(db.get_db)):
    correo = user.correo.strip()

    if not EMAIL_REGEX.match(correo):
        raise HTTPException(status_code=400, detail="Ingresa un correo electrónico válido.")

    user_exists = db_session.query(models.User).filter(
        (func.lower(models.User.correo) == correo.lower())
        | (func.lower(models.User.nombre_usuario) == user.nombre_usuario.lower())
    ).first()

    if user_exists:
        raise HTTPException(status_code=400, detail="El usuario o correo ya está registrado")

    hashed_pwd = get_password_hash(user.contrasena)
    new_user = models.User(
        nombre_usuario=user.nombre_usuario,
        correo=correo,
        nacionalidad=user.nacionalidad,
        contrasena_hash=hashed_pwd,
    )

    db_session.add(new_user)
    db_session.commit()
    db_session.refresh(new_user)
    return new_user

@router.post(
    "/login",
    response_model=schemas.Token,
    summary="Iniciar sesión",
    description="Autentica al usuario con nombre de usuario y contraseña, y devuelve un token JWT. "
                "El nombre de usuario no distingue mayúsculas de minúsculas.",
    response_description="Token de acceso generado.",
)
def login_user(form_data: OAuth2PasswordRequestForm = Depends(), db_session: Session = Depends(db.get_db)):
    user = db_session.query(models.User).filter(
        func.lower(models.User.nombre_usuario) == form_data.username.lower()
    ).first()

    if not user or not verify_password(form_data.password, user.contrasena_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Esta cuenta está inactiva",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.nombre_usuario})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "nombre_usuario": user.nombre_usuario,
        "rol": user.rol,
    }


@router.post(
    "/forgot-password",
    response_model=schemas.MessageResponse,
    summary="Solicitar código de recuperación",
    description="Envía un código de 6 dígitos al correo del usuario, válido por 15 minutos. "
                "Si el correo no está registrado, se informa explícitamente.",
    response_description="Confirmación de que la solicitud fue procesada.",
)
def forgot_password(data: schemas.PasswordResetRequest, db_session: Session = Depends(db.get_db)):
    correo = data.correo.strip()

    if not EMAIL_REGEX.match(correo):
        raise HTTPException(status_code=400, detail="Ingresa un correo electrónico válido.")

    user = db_session.query(models.User).filter(
        func.lower(models.User.correo) == correo.lower(),
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="Este correo no corresponde a una cuenta del sistema.")

    code = models.PasswordResetCode.generate_code()
    reset_entry = models.PasswordResetCode(
        usuario_id=user.id,
        codigo=code,
        expira_en=models.PasswordResetCode.new_expiration(minutes=15),
    )
    db_session.add(reset_entry)
    db_session.commit()

    try:
        send_reset_code_email(to_email=user.correo, username=user.nombre_usuario, code=code)
    except EmailSendError:
        raise HTTPException(
            status_code=500,
            detail="No se pudo enviar el correo. Intenta de nuevo en unos minutos.",
        )

    return {"mensaje": "Te enviamos un código a tu correo."}

@router.post(
    "/reset-password",
    response_model=schemas.MessageResponse,
    summary="Restablecer contraseña",
    description="Verifica el código recibido por correo y establece la nueva contraseña.",
    response_description="Confirmación de que la contraseña fue actualizada.",
)
def reset_password(data: schemas.PasswordResetVerify, db_session: Session = Depends(db.get_db)):
    user = db_session.query(models.User).filter(
        func.lower(models.User.correo) == data.correo.lower()
    ).first()
    if not user:
        raise HTTPException(status_code=400, detail="Código inválido o vencido")

    reset_entry = (
        db_session.query(models.PasswordResetCode)
        .filter(
            models.PasswordResetCode.usuario_id == user.id,
            models.PasswordResetCode.codigo == data.codigo,
            models.PasswordResetCode.usado == False,
        )
        .order_by(models.PasswordResetCode.id.desc())
        .first()
    )

    if not reset_entry or reset_entry.expira_en < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Código inválido o vencido")

    user.contrasena_hash = get_password_hash(data.nueva_contrasena)
    reset_entry.usado = True
    db_session.commit()

    return {"mensaje": "Contraseña actualizada correctamente"}


from fastapi.security import OAuth2PasswordBearer
from jose import JWTError


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
def get_current_user(token: str = Depends(oauth2_scheme), db_session: Session = Depends(db.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        nombre_usuario: str = payload.get("sub")
        if nombre_usuario is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db_session.query(models.User).filter(models.User.nombre_usuario == nombre_usuario).first()
    if user is None:
        raise credentials_exception

    return user


def require_role(min_role: int):
    """Genera una dependencia que exige un nivel minimo de privilegio (rol)."""
    def dependency(current_user: models.User = Depends(get_current_user)):
        if current_user.rol < min_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para realizar esta acción",
            )
        return current_user
    return dependency


get_current_admin = require_role(1)
get_current_reviewer = require_role(2)
