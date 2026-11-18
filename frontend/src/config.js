// URL base del backend: vacío en producción (mismo dominio Vercel), localhost en desarrollo.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''