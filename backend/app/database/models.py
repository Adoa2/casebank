# app/database/models.py
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