# Constantes de configuración globales leídas desde variables de entorno.
# Centraliza claves y parámetros para que ningún módulo acceda directamente a os.getenv.
import json
import os
from dotenv import find_dotenv, load_dotenv

# .env.local (ignorado por git) va primero para que sus valores ganen en las
# pruebas locales; load_dotenv no pisa variables ya definidas.
load_dotenv(find_dotenv(".env.local"))
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
EMAIL_FROM_NAME = "CaseBank - Manual Interactivo"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"
GEMINI_GENERATION_MODEL = "gemini-3.5-flash-lite"

DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# --- Videos con IA ---
# Todo el sistema queda apagado mientras VIDEO_IA_HABILITADO no sea "true":
# el router no se registra y la tabla trabajos_generacion_video no se crea
# automáticamente (solo con sql/migracion_videos_ia.sql).


def _bandera(nombre: str, por_defecto: bool = False) -> bool:
    """Lee una variable de entorno booleana ("true", "1", "si" o "yes" la activan)."""
    valor = os.getenv(nombre)
    if valor is None:
        return por_defecto
    return valor.strip().lower() in ("true", "1", "si", "sí", "yes")


VIDEO_IA_HABILITADO = _bandera("VIDEO_IA_HABILITADO", False)

# Proveedor de render. Solo "heygen" está implementado (services/heygen_client.py).
VIDEO_IA_PROVEEDOR = os.getenv("VIDEO_IA_PROVEEDOR", "heygen")
HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")  # opcional mientras el sistema esté apagado; nunca se registra
HEYGEN_API_BASE_URL = os.getenv("HEYGEN_API_BASE_URL", "https://api.heygen.com")

# Narración (TTS de HeyGen). La voz por defecto es Rocío (español).
# heygen-voice-1-turbo es de pago; heygen-voice-1-turbo-free no admite pronunciación.
VIDEO_IA_TTS_MODELO = os.getenv("VIDEO_IA_TTS_MODELO", "heygen-voice-1-turbo")
VIDEO_IA_TTS_VOZ_ID = os.getenv("VIDEO_IA_TTS_VOZ_ID", "84854979e66846989bc6c5855f53268f")
VIDEO_IA_TTS_IDIOMA = os.getenv("VIDEO_IA_TTS_IDIOMA", "es")
# Diccionario de pronunciación (término -> IPA entre barras), en texto JSON.
# Se envía como pronunciation_dictionary en cada narración.
# El valor por defecto salió de la prueba de pronunciación de noviembre de 2026
# con heygen-voice-1-turbo y la voz Rocío: se compararon cuatro audios (sin
# ajuste, IPA en línea con fonemas del inglés, diccionario con fonemas del
# inglés y diccionario con fonemas del español) y se eligió el número 4, el
# de fonemas del español, para "CaseBank" y "Casey".
# Se cambia con la variable de entorno VIDEO_IA_TTS_PRONUNCIACIONES (texto JSON)
# sin tocar el código. Para desactivarlo, definirla vacía
# (VIDEO_IA_TTS_PRONUNCIACIONES=) o con {}.
_PRONUNCIACIONES_POR_DEFECTO = {"CaseBank": "/ˈkejs.baŋk/", "Casey": "/ˈkej.si/"}
_pronunciaciones_entorno = os.getenv("VIDEO_IA_TTS_PRONUNCIACIONES")
VIDEO_IA_TTS_PRONUNCIACIONES = (
    dict(_PRONUNCIACIONES_POR_DEFECTO)
    if _pronunciaciones_entorno is None
    else json.loads(_pronunciaciones_entorno.strip() or "{}")
)

# Plantilla Hyperframes (carpeta dentro de app/video_templates) y calidad del render.
VIDEO_IA_PLANTILLA = os.getenv("VIDEO_IA_PLANTILLA", "casebank_v1")
VIDEO_IA_CALIDAD = "standard"

# Calidad fija: 1080p. 4K no se permite (cuesta 1,5 veces más).
VIDEO_IA_RESOLUCION = "1080p"

# Límites de costo, configurables.
VIDEO_IA_MAX_ESCENAS = int(os.getenv("VIDEO_IA_MAX_ESCENAS", "20"))
VIDEO_IA_MAX_CARACTERES = int(os.getenv("VIDEO_IA_MAX_CARACTERES", "4500"))
VIDEO_IA_MAX_DURACION_SEGUNDOS = int(os.getenv("VIDEO_IA_MAX_DURACION_SEGUNDOS", "300"))
VIDEO_IA_MAX_TRABAJOS_POR_DIA = int(os.getenv("VIDEO_IA_MAX_TRABAJOS_POR_DIA", "10"))
VIDEO_IA_TIEMPO_LIMITE_MINUTOS = int(os.getenv("VIDEO_IA_TIEMPO_LIMITE_MINUTOS", "15"))

# Trabajo por consulta del panel: cuántas narraciones se generan en cada paso
# y cuánto puede durar la copia del mp4 antes de dejarla para un reintento.
VIDEO_IA_NARRACIONES_POR_PASO = int(os.getenv("VIDEO_IA_NARRACIONES_POR_PASO", "4"))
VIDEO_IA_TIEMPO_MAX_DESCARGA_SEGUNDOS = int(os.getenv("VIDEO_IA_TIEMPO_MAX_DESCARGA_SEGUNDOS", "240"))

# Estimación de costo y duración. Mediciones reales de render a 1080p estándar:
# USD 0,05 por 16,9 s y USD 0,0667 por 22,06 s (unos USD 0,003 por segundo).
# Se usa USD 0,0034 por segundo (unos USD 0,20 por minuto) para estimar con
# margen. La voz se deja en USD 15 por millón de caracteres hasta ver un cargo
# real: en las pruebas de noviembre de 2026 la voz turbo no generó cargos.
VIDEO_IA_PRECIO_VOZ_USD_POR_MILLON_CARACTERES = float(os.getenv("VIDEO_IA_PRECIO_VOZ_USD_POR_MILLON_CARACTERES", "15.0"))
VIDEO_IA_PRECIO_RENDER_USD_POR_SEGUNDO = float(os.getenv("VIDEO_IA_PRECIO_RENDER_USD_POR_SEGUNDO", "0.0034"))
VIDEO_IA_CARACTERES_POR_SEGUNDO = float(os.getenv("VIDEO_IA_CARACTERES_POR_SEGUNDO", "16.5"))
# Silencio entre escenas en la narración unida. También es el margen fijo que
# se suma al final de cada escena (duración de escena = audio real + pausa),
# así imagen y voz quedan sincronizadas.
VIDEO_IA_PAUSA_ESCENA_SEGUNDOS = float(os.getenv("VIDEO_IA_PAUSA_ESCENA_SEGUNDOS", "0.4"))

# Buckets de Supabase Storage (mismos nombres que usaba la versión anterior).
SUPABASE_BUCKET_VIDEOS_IA = os.getenv("SUPABASE_BUCKET_VIDEOS_IA", "videos-generados")
SUPABASE_BUCKET_VIDEOS_IA_IMAGENES = os.getenv("SUPABASE_BUCKET_VIDEOS_IA_IMAGENES", "video-generacion-imagenes")
