# app/services/email_service.py
"""
Recuperacion de contrasena - envio del codigo de verificacion por correo.

Usa SMTP directo (pensado por defecto para Gmail con una "contrasena de
aplicacion", sin depender de Resend/SendGrid). Si mas adelante prefieres
uno de esos servicios en vez de SMTP, solo hay que reemplazar el cuerpo de
send_reset_code_email por una llamada a su API; el resto del proyecto
(modelo, rutas, frontend) no cambia.

La configuracion (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM_NAME)
vive en app/config.py, junto a SECRET_KEY, para mantener el mismo estilo del
resto del proyecto.
"""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import (
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    EMAIL_FROM_NAME,
)


class EmailSendError(Exception):
    """Se lanza cuando el correo no pudo enviarse (credenciales, red, etc.)."""


def send_reset_code_email(to_email: str, username: str, code: str) -> None:
    """
    Envia el correo con el codigo de verificacion de 6 digitos.
    Lanza EmailSendError si algo falla, para que el router lo capture
    y responda con un 500 sin filtrar detalles internos al cliente.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        raise EmailSendError(
            "Faltan configurar SMTP_USER / SMTP_PASSWORD en app/config.py."
        )

    subject = "Codigo para restablecer tu contrasena - CaseBank"
    body = (
        f"Hola {username},\n\n"
        f"Recibimos una solicitud para restablecer tu contrasena en el "
        f"Manual Interactivo de CaseBank.\n\n"
        f"Tu codigo de verificacion es:\n\n"
        f"    {code}\n\n"
        f"Este codigo vence en 15 minutos. Si no solicitaste este cambio, "
        f"puedes ignorar este correo con tranquilidad.\n\n"
        f"- Equipo CaseBank"
    )

    message = MIMEMultipart()
    message["From"] = f"{EMAIL_FROM_NAME} <{SMTP_USER}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(body, "plain", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to_email, message.as_string())
    except Exception as exc:
        raise EmailSendError(f"No se pudo enviar el correo: {exc}") from exc