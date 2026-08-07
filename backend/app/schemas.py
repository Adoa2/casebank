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