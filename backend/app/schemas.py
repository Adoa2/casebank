from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    """Datos necesarios para registrar un nuevo usuario."""
    username: str = Field(
        ...,
        description="Nombre de usuario único. Se usará para iniciar sesión.",
        examples=["usuario"],
    )
    email: str = Field(
        ...,
        description="Correo electrónico del usuario. Debe ser único.",
        examples=["usuario@ejemplo.com"],
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Contraseña en texto plano. Se guarda encriptada (hash), nunca en texto plano.",
        examples=["MiClaveSegura123"],
    )


class UserResponse(BaseModel):
    """Datos públicos del usuario devueltos tras registrarse o consultarse."""
    id: int = Field(..., description="Identificador único del usuario en la base de datos.")
    username: str = Field(..., description="Nombre de usuario.")
    email: str = Field(..., description="Correo electrónico del usuario.")

    class Config:
        from_attributes = True


class Token(BaseModel):
    """Token de acceso devuelto al iniciar sesión correctamente."""
    access_token: str = Field(..., description="Token JWT para autenticar futuras peticiones.")
    token_type: str = Field(
        default="bearer",
        description="Tipo de token. Siempre es 'bearer'.",
        examples=["bearer"],
    )
    username: str = Field(..., description="Nombre de usuario autenticado.")
    role: int = Field(..., description="Nivel de privilegio: 0 usuario, 1 admin, 2 privilegio mayor.")


class PasswordResetRequest(BaseModel):
    """Datos para solicitar el código de recuperación de contraseña."""
    email: str = Field(..., description="Correo electrónico asociado a la cuenta.")


class PasswordResetVerify(BaseModel):
    """Datos para verificar el código de recuperación y establecer una nueva contraseña."""
    email: str = Field(..., description="Correo electrónico asociado a la cuenta.")
    code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        description="Código de 6 dígitos enviado al correo del usuario.",
        examples=["483920"],
    )
    new_password: str = Field(
        ...,
        min_length=8,
        description="Nueva contraseña que reemplazará a la anterior.",
    )


class MessageResponse(BaseModel):
    """Respuesta genérica con un mensaje informativo."""
    message: str = Field(..., description="Mensaje descriptivo del resultado de la operación.")


# --- Administración de usuarios ---

class UserAdminResponse(BaseModel):
    """Datos completos de un usuario, para el panel administrativo."""
    id: int
    username: str
    email: str
    role: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserAdminCreate(BaseModel):
    """Datos para crear un usuario desde el panel administrativo."""
    username: str
    email: str
    password: str = Field(..., min_length=8)
    role: int = Field(0, ge=0, le=2, description="0 usuario, 1 admin, 2 privilegio mayor.")
    is_active: bool = True


class UserAdminUpdate(BaseModel):
    """Datos editables de un usuario desde el panel administrativo. Todos opcionales."""
    email: Optional[str] = None
    role: Optional[int] = Field(None, ge=0, le=2)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8)


# --- Errores frecuentes ---

# --- Errores frecuentes ---

class ErrorReportCreate(BaseModel):
    """Datos para registrar un nuevo error frecuente (queda en estado 'pendiente')."""
    titulo: str
    modulo: str
    descripcion: str
    causa: Optional[str] = None
    solucion: str
    procedimiento: Optional[str] = None
    palabras_clave: Optional[str] = None
    nivel: Optional[str] = None
    requiere_ticket: bool = Field(
        False,
        description="Si es True, el asistente de IA agrega automaticamente el enlace "
                    "al sistema de tickets cuando use esta solucion para responder.",
    )
    tiene_evidencia: bool = Field(
        False,
        description="Si es True, este error tiene una imagen de referencia asociada "
                    "(imagen_url) que el asistente muestra al usuario para confirmar "
                    "que es el error que esta presentando.",
    )
    imagen_url: Optional[str] = Field(
        None,
        description="URL publica de la imagen de evidencia (subida previamente via "
                    "POST /errors/upload-imagen). Requerido si tiene_evidencia es True.",
    )

class ErrorReportUpdate(BaseModel):
    """Datos editables de un error frecuente. Todos opcionales."""
    titulo: Optional[str] = None
    modulo: Optional[str] = None
    descripcion: Optional[str] = None
    causa: Optional[str] = None
    solucion: Optional[str] = None
    procedimiento: Optional[str] = None
    palabras_clave: Optional[str] = None
    requiere_ticket: Optional[bool] = None
    tiene_evidencia: Optional[bool] = None
    imagen_url: Optional[str] = None

class ErrorReportResponse(BaseModel):
    id: int
    titulo: str
    modulo: str
    descripcion: str
    causa: Optional[str]
    solucion: str
    procedimiento: Optional[str]
    palabras_clave: Optional[str]
    nivel: Optional[str]
    requiere_ticket: bool
    tiene_evidencia: bool
    imagen_url: Optional[str]
    estado: str
    created_by: int
    reviewed_by: Optional[int]
    created_at: datetime
    reviewed_at: Optional[datetime]

    class Config:
        from_attributes = True


class ErrorReportReview(BaseModel):
    """Decisión del revisor sobre un error pendiente."""
    aprobar: bool = Field(..., description="True para aprobar (se indexa para la IA), False para rechazar.")


class ImagenUploadResponse(BaseModel):
    """URL publica devuelta tras subir una imagen de evidencia a Supabase Storage."""
    url: str = Field(..., description="URL publica de la imagen subida.")
    # --- Videos formativos ---

class VideoCreate(BaseModel):
    """Datos para registrar un nuevo video formativo, vinculado a una seccion del manual."""
    titulo: str
    url: str
    seccion_id: int = Field(..., description="ID de la seccion del manual (SeccionManual.id) a la que se vincula el video.")
    capitulo: str = Field(..., description="Titulo del capitulo, tal como aparece en el manual al momento de crear el video.")
    seccion: Optional[str] = None
    subseccion: Optional[str] = None


class VideoUpdate(BaseModel):
    """Datos editables de un video formativo. Todos opcionales."""
    titulo: Optional[str] = None
    url: Optional[str] = None
    seccion_id: Optional[int] = None
    capitulo: Optional[str] = None
    seccion: Optional[str] = None
    subseccion: Optional[str] = None


class VideoResponse(BaseModel):
    id: int
    titulo: str
    url: str
    seccion_id: int
    capitulo: str
    seccion: Optional[str]
    subseccion: Optional[str]
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True