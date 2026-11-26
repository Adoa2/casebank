# Esquemas Pydantic para validación de entrada y serialización de salida de la API.
# Separados de los modelos ORM para no exponer campos internos de la base de datos.
from datetime import datetime
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class UserCreate(BaseModel):
    """Datos necesarios para registrar un nuevo usuario."""
    nombre_usuario: str = Field(
        ...,
        description="Nombre de usuario único. Se usará para iniciar sesión.",
        examples=["usuario"],
    )
    correo: str = Field(
        ...,
        description="Correo electrónico del usuario. Debe ser único.",
        examples=["usuario@ejemplo.com"],
    )
    contrasena: str = Field(
        ...,
        min_length=8,
        description="Contraseña en texto plano. Se guarda encriptada (hash), nunca en texto plano.",
        examples=["MiClaveSegura123"],
    )
    nacionalidad: Literal["hondurena", "dominicana"] = Field(
        ...,
        description="Nacionalidad seleccionada por el usuario.",
        examples=["hondurena"],
    )

    @field_validator("contrasena")
    @classmethod
    def validate_password_strength(cls, contrasena: str) -> str:
        """Exige mayúscula, minúscula, dígito y carácter especial en la contraseña."""
        requirements = (
            re.search(r"[A-ZÁÉÍÓÚÑ]", contrasena),
            re.search(r"[a-záéíóúñ]", contrasena),
            re.search(r"\d", contrasena),
            re.search(r"[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s]", contrasena),
        )
        if not all(requirements):
            raise ValueError(
                "La contraseña debe incluir mayúscula, minúscula, número y carácter especial."
            )
        return contrasena


class UserResponse(BaseModel):
    """Datos públicos del usuario devueltos tras registrarse o consultarse."""
    id: int = Field(..., description="Identificador único del usuario en la base de datos.")
    nombre_usuario: str = Field(..., description="Nombre de usuario.")
    correo: str = Field(..., description="Correo electrónico del usuario.")
    nacionalidad: str = Field(..., description="Nacionalidad del usuario.")

    class Config:
        """Habilita la construcción desde instancias ORM."""
        from_attributes = True


class Token(BaseModel):
    """Token de acceso devuelto al iniciar sesión correctamente."""
    access_token: str = Field(..., description="Token JWT para autenticar futuras peticiones.")
    token_type: str = Field(
        default="bearer",
        description="Tipo de token. Siempre es 'bearer'.",
        examples=["bearer"],
    )
    nombre_usuario: str = Field(..., description="Nombre de usuario autenticado.")
    rol: int = Field(..., description="Nivel de privilegio: 0 usuario, 1 admin, 2 privilegio mayor.")


class PasswordResetRequest(BaseModel):
    """Datos para solicitar el código de recuperación de contraseña."""
    correo: str = Field(..., description="Correo electrónico asociado a la cuenta.")


class PasswordResetVerify(BaseModel):
    """Datos para verificar el código de recuperación y establecer una nueva contraseña."""
    correo: str = Field(..., description="Correo electrónico asociado a la cuenta.")
    codigo: str = Field(
        ...,
        min_length=6,
        max_length=6,
        description="Código de 6 dígitos enviado al correo del usuario.",
        examples=["483920"],
    )
    nueva_contrasena: str = Field(
        ...,
        min_length=8,
        description="Nueva contraseña que reemplazará a la anterior.",
    )


class MessageResponse(BaseModel):
    """Respuesta genérica con un mensaje informativo."""
    mensaje: str = Field(..., description="Mensaje descriptivo del resultado de la operación.")


# --- Administración de usuarios ---

class UserAdminResponse(BaseModel):
    """Datos completos de un usuario, para el panel administrativo."""
    id: int
    nombre_usuario: str
    correo: str
    nacionalidad: Optional[str] = None
    rol: int
    activo: bool
    creado_en: datetime

    class Config:
        """Habilita la construcción desde instancias ORM."""
        from_attributes = True


class UserAdminCreate(BaseModel):
    """Datos para crear un usuario desde el panel administrativo."""
    nombre_usuario: str
    correo: str
    nacionalidad: Optional[Literal["hondurena", "dominicana"]] = None
    contrasena: str = Field(..., min_length=8)
    rol: int = Field(0, ge=0, le=2, description="0 usuario, 1 admin, 2 privilegio mayor.")
    activo: bool = True


class UserAdminUpdate(BaseModel):
    """Datos editables de un usuario desde el panel administrativo. Todos opcionales."""
    correo: Optional[str] = None
    nacionalidad: Optional[Literal["hondurena", "dominicana"]] = None
    rol: Optional[int] = Field(None, ge=0, le=2)
    activo: Optional[bool] = None
    contrasena: Optional[str] = Field(None, min_length=8)


class DiagnosticoOpcionCreate(BaseModel):
    """Un par pregunta-respuesta del diagnóstico interactivo de un error."""
    pregunta: str = Field(..., min_length=1, max_length=200, description="Ej. 'Otorgamiento de crédito'.")
    respuesta: str = Field(..., min_length=1, description="Respuesta exacta que Casey mostrará si el usuario elige esta opción.")


class DiagnosticoOpcionResponse(BaseModel):
    """Opción de diagnóstico serializada para la respuesta de la API."""
    id: int
    pregunta: str
    respuesta: str
    orden: int

    class Config:
        """Habilita la construcción desde instancias ORM."""
        from_attributes = True


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
    tiene_diagnostico: bool = Field(
        False,
        description="Si es True, tras confirmar que es este error, Casey pregunta al usuario "
                    "que accion esta realizando y responde segun la opcion elegida, en vez de "
                    "generar causa/solucion con el LLM.",
    )
    diagnostico_titulo: Optional[str] = Field(
        None,
        description="Ya no se usa: el mensaje previo a las opciones es fijo "
                    "('¿Que accion esta realizando?') y no lo define el admin. "
                    "Se mantiene el campo por compatibilidad, pero se ignora.",
    )
    diagnostico_opciones: list[DiagnosticoOpcionCreate] = Field(
        default_factory=list,
        description="Pares etiqueta/respuesta del diagnostico. Minimo 2 si tiene_diagnostico es True.",
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
    tiene_diagnostico: Optional[bool] = None
    diagnostico_titulo: Optional[str] = None
    diagnostico_opciones: Optional[list[DiagnosticoOpcionCreate]] = None


class ErrorReportResponse(BaseModel):
    """Error frecuente serializado para la API, incluyendo sus opciones de diagnóstico."""
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
    creado_por: int
    revisado_por: Optional[int]
    creado_por_nombre: Optional[str] = None
    revisado_por_nombre: Optional[str] = None
    creado_en: datetime
    revisado_en: Optional[datetime]
    tiene_diagnostico: bool
    diagnostico_titulo: Optional[str]
    diagnostico_opciones: list[DiagnosticoOpcionResponse] = []

    class Config:
        """Habilita la construcción desde instancias ORM."""
        from_attributes = True


class ErrorReportReview(BaseModel):
    """Decisión del revisor sobre un error pendiente."""
    aprobar: bool = Field(..., description="True para aprobar (se indexa para la IA), False para rechazar.")


class ImagenUploadResponse(BaseModel):
    """URL publica (relativa en almacenamiento local) devuelta tras subir una imagen de evidencia."""
    url: str = Field(..., description="URL publica de la imagen subida.")


# --- Videos formativos ---

class VideoCreate(BaseModel):
    """Datos para registrar un nuevo video formativo, vinculado a una seccion del manual."""
    titulo: str
    enlace: str
    seccion_id: int = Field(..., description="ID de la seccion del manual (SeccionManual.id) a la que se vincula el video.")
    capitulo: str = Field(..., description="Titulo del capitulo, tal como aparece en el manual al momento de crear el video.")
    seccion: Optional[str] = None
    subseccion: Optional[str] = None


class VideoUpdate(BaseModel):
    """Datos editables de un video formativo. Todos opcionales."""
    titulo: Optional[str] = None
    enlace: Optional[str] = None
    seccion_id: Optional[int] = None
    capitulo: Optional[str] = None
    seccion: Optional[str] = None
    subseccion: Optional[str] = None


class VideoResponse(BaseModel):
    """Video formativo serializado para la API."""
    id: int
    titulo: str
    enlace: str
    seccion_id: int
    capitulo: str
    seccion: Optional[str]
    subseccion: Optional[str]
    creado_por: int
    creado_en: datetime

    class Config:
        """Habilita la construcción desde instancias ORM."""
        from_attributes = True


# --- Documentos de actualizaciones ---

class UpdateDocumentUpdate(BaseModel):
    """Campos editables de un documento de actualización. Todos opcionales."""
    titulo: Optional[str] = Field(None, min_length=3, max_length=180)
    descripcion: Optional[str] = Field(None, min_length=5, max_length=3000)
    palabras_clave: Optional[str] = Field(None, min_length=2, max_length=1000)
    aplicabilidad: Optional[Literal["honduras", "dominicana", "ambas"]] = None
    seccion_id: Optional[int] = None
    capitulo: Optional[str] = Field(None, min_length=1, max_length=500)
    seccion: Optional[str] = Field(None, min_length=1, max_length=500)
    subseccion: Optional[str] = Field(None, max_length=500)
    activo: Optional[bool] = None


class UpdateDocumentResponse(BaseModel):
    """Documento de actualización serializado para la API, con datos del creador."""
    id: int
    titulo: str
    descripcion: str
    palabras_clave: str
    aplicabilidad: Literal["honduras", "dominicana", "ambas"]
    seccion_id: Optional[int] = None
    capitulo: Optional[str] = None
    seccion: Optional[str] = None
    subseccion: Optional[str] = None
    archivo_url: str
    archivo_nombre: str
    activo: bool
    creado_por: int
    creado_por_nombre: Optional[str] = None
    creado_en: datetime
    actualizado_en: datetime

    class Config:
        """Habilita la construcción desde instancias ORM."""
        from_attributes = True
