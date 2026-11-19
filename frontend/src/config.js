// URL base del backend: vacío en producción (mismo dominio Vercel), localhost en desarrollo.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
// Videos con IA: la sección solo existe si VITE_VIDEO_IA_HABILITADO es "true"
// al compilar. Por defecto queda apagada y el build de producción no la incluye.
export const VIDEO_IA_HABILITADO = import.meta.env.VITE_VIDEO_IA_HABILITADO === 'true'
