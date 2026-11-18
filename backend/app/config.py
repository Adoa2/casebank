import os
from dotenv import load_dotenv

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

# TODO: DESHABILITADO TEMPORALMENTE - generación de videos IA
# SHOTSTACK_API_KEY = os.getenv("SHOTSTACK_API_KEY")

# SHOTSTACK_EDIT_BASE_URL = os.getenv("SHOTSTACK_EDIT_BASE_URL", "https://api.shotstack.io/edit/v1")
# SHOTSTACK_WEBHOOK_URL = os.getenv("SHOTSTACK_WEBHOOK_URL", "")

# Voz y ritmo de narración en español.
# Voces disponibles en español: Lucia/Sergio (es-ES), Mia/Andrés (es-MX), Lupe/Pedro (es-US)
# SHOTSTACK_TTS_VOICE = os.getenv("SHOTSTACK_TTS_VOICE", "Mia")
# SHOTSTACK_TTS_LANGUAGE = os.getenv("SHOTSTACK_TTS_LANGUAGE", "es-MX")
# SHOTSTACK_WORDS_PER_SECOND = float(os.getenv("SHOTSTACK_WORDS_PER_SECOND", "2.3"))
# SHOTSTACK_ESCENA_PADDING_SEGUNDOS = float(os.getenv("SHOTSTACK_ESCENA_PADDING_SEGUNDOS", "1.0"))

# Buckets de Supabase Storage.
# SUPABASE_BUCKET_VIDEOS_GENERADOS = os.getenv("SUPABASE_BUCKET_VIDEOS_GENERADOS", "videos-generados")
# SUPABASE_BUCKET_VIDEO_GEN_IMAGENES = os.getenv("SUPABASE_BUCKET_VIDEO_GEN_IMAGENES", "video-generacion-imagenes")

# VIDEO_GENERACION_INTRO_IMAGEN_URL = os.getenv("VIDEO_GENERACION_INTRO_IMAGEN_URL", "")
# VIDEO_GENERACION_OUTRO_IMAGEN_URL = os.getenv("VIDEO_GENERACION_OUTRO_IMAGEN_URL", "")