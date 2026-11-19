# Constantes de configuración globales leídas desde variables de entorno.
# Centraliza claves y parámetros para que ningún módulo acceda directamente a os.getenv.
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

# Proveedor de render. Solo "heygen" está previsto; su cliente aún es un esqueleto.
VIDEO_IA_PROVEEDOR = os.getenv("VIDEO_IA_PROVEEDOR", "heygen")
HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")  # opcional mientras el sistema esté apagado

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

# Estimación de costo y duración. La tarifa de render sale de una sola medición
# (USD 0,05 por 16,9 s a 1080p) y debe confirmarse con la tarifa oficial.
VIDEO_IA_PRECIO_VOZ_USD_POR_MILLON_CARACTERES = float(os.getenv("VIDEO_IA_PRECIO_VOZ_USD_POR_MILLON_CARACTERES", "15.0"))
VIDEO_IA_PRECIO_RENDER_USD_POR_SEGUNDO = float(os.getenv("VIDEO_IA_PRECIO_RENDER_USD_POR_SEGUNDO", "0.003"))
VIDEO_IA_CARACTERES_POR_SEGUNDO = float(os.getenv("VIDEO_IA_CARACTERES_POR_SEGUNDO", "16.5"))
VIDEO_IA_PAUSA_ESCENA_SEGUNDOS = float(os.getenv("VIDEO_IA_PAUSA_ESCENA_SEGUNDOS", "0.4"))

# Buckets de Supabase Storage (mismos nombres que usaba la versión anterior).
SUPABASE_BUCKET_VIDEOS_IA = os.getenv("SUPABASE_BUCKET_VIDEOS_IA", "videos-generados")
SUPABASE_BUCKET_VIDEOS_IA_IMAGENES = os.getenv("SUPABASE_BUCKET_VIDEOS_IA_IMAGENES", "video-generacion-imagenes")
