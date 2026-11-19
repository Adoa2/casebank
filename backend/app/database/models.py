# Modelos ORM de la base de datos (SQLAlchemy).
# Mapean las tablas de PostgreSQL y son usados por todos los routers y servicios.
import random
import string
from datetime import datetime, timedelta

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from .db import Base


class User(Base):
    """Cuenta de usuario del sistema. rol: 0 = usuario, 1 = admin, 2 = privilegio mayor."""
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre_usuario = Column(String, unique=True, index=True, nullable=False)
    correo = Column(String, unique=True, index=True, nullable=False)
    nacionalidad = Column(String, nullable=True)
    contrasena_hash = Column(String, nullable=False)
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    rol = Column(Integer, default=0, nullable=False)


class PasswordResetCode(Base):
    """Código de 6 dígitos para recuperación de contraseña, válido 15 minutos."""
    __tablename__ = "codigos_recuperacion_contrasena"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    codigo = Column(String(6), nullable=False)
    expira_en = Column(DateTime, nullable=False)
    usado = Column(Boolean, default=False)
    creado_en = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")

    @staticmethod
    def generate_code() -> str:
        """Genera un código numérico de 6 dígitos."""
        return "".join(random.choices(string.digits, k=6))

    @staticmethod
    def new_expiration(minutes: int = 15) -> datetime:
        """Devuelve la fecha de expiración a partir de ahora."""
        return datetime.utcnow() + timedelta(minutes=minutes)


class ErrorReport(Base):
    """
    Error frecuente del sistema. Flujo: pendiente → aprobado (indexado en RAG) | rechazado.
    Si tiene_diagnostico es True, Casey pregunta la acción antes de dar la solución.
    """
    __tablename__ = "reportes_errores"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String, nullable=False)
    modulo = Column(String, nullable=False)
    descripcion = Column(String, nullable=False)
    causa = Column(String, nullable=True)
    solucion = Column(String, nullable=False)
    procedimiento = Column(String, nullable=True)
    palabras_clave = Column(String, nullable=True)
    nivel = Column(String, nullable=True)
    requiere_ticket = Column(Boolean, default=False, nullable=False)
    tiene_evidencia = Column(Boolean, default=False, nullable=False)
    imagen_url = Column(String, nullable=True)
    estado = Column(String, default="pendiente", nullable=False)  # pendiente | aprobado | rechazado
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    revisado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)
    revisado_en = Column(DateTime, nullable=True)

    creator = relationship("User", foreign_keys=[creado_por])
    reviewer = relationship("User", foreign_keys=[revisado_por])
    tiene_diagnostico = Column(Boolean, nullable=False, default=False)
    diagnostico_titulo = Column(String, nullable=True)
    diagnostico_opciones = relationship(
        "ErrorDiagnosticoOpcion",
        back_populates="error",
        cascade="all, delete-orphan",
        order_by="ErrorDiagnosticoOpcion.orden",
    )

    @property
    def creado_por_nombre(self):
        """Nombre del usuario que creó el error (desde la relación ORM)."""
        return self.creator.nombre_usuario if self.creator else None

    @property
    def revisado_por_nombre(self):
        """Nombre del usuario que revisó el error (desde la relación ORM)."""
        return self.reviewer.nombre_usuario if self.reviewer else None


class ErrorDiagnosticoOpcion(Base):
    """Una opción del diagnóstico interactivo de un error: etiqueta que ve el usuario + respuesta que Casey muestra."""
    __tablename__ = "error_diagnostico_opciones"

    id = Column(Integer, primary_key=True, index=True)
    reporte_id = Column(Integer, ForeignKey("reportes_errores.id", ondelete="CASCADE"), nullable=False)
    pregunta = Column(String, nullable=False)
    respuesta = Column(Text, nullable=False)
    orden = Column(Integer, nullable=False, default=0)

    error = relationship("ErrorReport", back_populates="diagnostico_opciones")


class Video(Base):
    """Video formativo vinculado a una sección del manual (seccion_id)."""
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String, nullable=False)
    enlace = Column(String, nullable=False)
    seccion_id = Column(Integer, nullable=False, index=True)
    capitulo = Column(String, nullable=False)
    seccion = Column(String, nullable=True)
    subseccion = Column(String, nullable=True)
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)

    creator = relationship("User", foreign_keys=[creado_por])


class UpdateDocument(Base):
    """
    Documento PDF de actualización del manual, con sus fragmentos indexados en RAG.
    aplicabilidad controla qué usuarios lo ven: 'honduras' | 'dominicana' | 'ambas'.
    """
    __tablename__ = "documentos_actualizacion"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String, nullable=False)
    descripcion = Column(Text, nullable=False)
    palabras_clave = Column(String, nullable=False)
    aplicabilidad = Column(String, nullable=False)  # honduras | dominicana | ambas
    seccion_id = Column(Integer, nullable=True, index=True)
    capitulo = Column(String, nullable=True)
    seccion = Column(String, nullable=True)
    subseccion = Column(String, nullable=True)
    archivo_url = Column(String, nullable=False)
    archivo_nombre = Column(String, nullable=False)
    ruta_almacenamiento = Column(String, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    creator = relationship("User", foreign_keys=[creado_por])

    @property
    def creado_por_nombre(self):
        """Nombre del usuario que subió el documento (desde la relación ORM)."""
        return self.creator.nombre_usuario if self.creator else None


# --- Videos con IA ---
# Esta tabla NO la crea Base.metadata.create_all (ver TABLAS_SOLO_MIGRACION y
# main.py): solo existe si se ejecuta sql/migracion_videos_ia.sql. Así, con
# VIDEO_IA_HABILITADO en falso, producción no cambia.
ESTADOS_TRABAJO_VIDEO = ("pendiente", "procesando", "descarga_pendiente", "completado", "fallido", "cancelado")
ESTADOS_TRABAJO_VIDEO_ACTIVOS = ("pendiente", "procesando")
ETAPAS_TRABAJO_VIDEO = ("guion", "voz", "render", "descarga")


class TrabajoGeneracionVideo(Base):
    """
    Trabajo de generación de un video con IA.

    Estados: pendiente -> procesando -> completado | fallido | cancelado.
    descarga_pendiente: el render terminó pero no se pudo copiar el mp4; se
    conserva render_id_externo para pedir un enlace nuevo al proveedor.
    etapa indica el paso interno dentro de "procesando": guion, voz, render, descarga.
    Un índice único parcial en la migración permite un solo trabajo activo
    (pendiente o procesando) por usuario.
    """
    __tablename__ = "trabajos_generacion_video"
    __table_args__ = (
        UniqueConstraint("proveedor", "render_id_externo", name="uq_trabajos_video_render_externo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String, nullable=False)
    descripcion_inconveniente = Column(Text, nullable=False)
    pasos = Column(JSONB, nullable=False)  # [{"texto": str, "imagen_url": str | None}]
    puntos_a_considerar = Column(Text, nullable=True)
    guion = Column(JSONB, nullable=True)  # {"escenas": [{"titulo", "narracion", "captura", ...}]}
    estado = Column(String, nullable=False, default="pendiente")
    etapa = Column(String, nullable=True)
    proveedor = Column(String, nullable=False)
    render_id_externo = Column(String, nullable=True)
    recursos_externos = Column(JSONB, nullable=False, default=list)  # ids de assets subidos al proveedor
    resolucion = Column(String, nullable=False, default="1080p")
    caracteres_narracion = Column(Integer, nullable=True)
    duracion_estimada_segundos = Column(Numeric(7, 2), nullable=True)
    duracion_segundos = Column(Numeric(7, 2), nullable=True)
    costo_estimado_usd = Column(Numeric(10, 4), nullable=True)
    enlace = Column(String, nullable=True)  # mp4 final en Supabase Storage
    mensaje_error = Column(Text, nullable=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="SET NULL"), nullable=True, unique=True)
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    completado_en = Column(DateTime, nullable=True)

    creator = relationship("User", foreign_keys=[creado_por])
    video = relationship("Video", foreign_keys=[video_id])

    @property
    def creado_por_nombre(self):
        """Nombre del usuario que creó el trabajo (desde la relación ORM)."""
        return self.creator.nombre_usuario if self.creator else None


# Tablas que solo se crean con su migración SQL, nunca con create_all.
TABLAS_SOLO_MIGRACION = {TrabajoGeneracionVideo.__tablename__}
