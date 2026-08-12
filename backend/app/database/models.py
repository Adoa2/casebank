import random
import string
from datetime import datetime, timedelta

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    role = Column(Integer, default=0, nullable=False)


class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")

    @staticmethod
    def generate_code() -> str:
        return "".join(random.choices(string.digits, k=6))

    @staticmethod
    def new_expiration(minutes: int = 15) -> datetime:
        return datetime.utcnow() + timedelta(minutes=minutes)


class ErrorReport(Base):
    __tablename__ = "error_reports"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String, nullable=False)
    modulo = Column(String, nullable=False)
    descripcion = Column(String, nullable=False)
    causa = Column(String, nullable=True)
    solucion = Column(String, nullable=False)
    procedimiento = Column(String, nullable=True)
    palabras_clave = Column(String, nullable=True)
    nivel = Column(String, nullable=True)
    estado = Column(String, default="pendiente", nullable=False)  # pendiente | aprobado | rechazado
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    reviewed_at = Column(DateTime, nullable=True)

    creator = relationship("User", foreign_keys=[created_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])