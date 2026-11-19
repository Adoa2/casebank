// Videos con IA: trabajos de generación, avance por pasos y publicación en el manual.
// Todos los endpoints viven bajo /api/videos-ia y requieren rol 2.
import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from './authToken'

const BASE = `${API_BASE_URL}/api/videos-ia`

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  }).then(parseApiResponse)
}

/** Límites vigentes del módulo (escenas, caracteres, duración, trabajos por día). */
export async function obtenerConfiguracionVideosIA() {
  return fetch(`${BASE}/configuracion`, { headers: authHeaders() }).then(parseApiResponse)
}

/** Sube la captura de un paso y devuelve { url }. */
export async function subirImagenVideoIA(file) {
  const formData = new FormData()
  formData.append('file', file)
  return fetch(`${BASE}/imagenes`, { method: 'POST', headers: authHeaders(), body: formData }).then(parseApiResponse)
}

/** Crea un trabajo en "pendiente". No genera nada todavía: el panel lo avanza. */
export async function crearTrabajoVideoIA({ titulo, descripcionInconveniente, pasos, puntosAConsiderar }) {
  return post(BASE, {
    titulo,
    descripcion_inconveniente: descripcionInconveniente,
    pasos,
    puntos_a_considerar: puntosAConsiderar,
  })
}

export async function listarTrabajosVideoIA() {
  return fetch(BASE, { headers: authHeaders() }).then(parseApiResponse)
}

/** Ejecuta un paso corto del trabajo y devuelve su estado actualizado. */
export async function avanzarTrabajoVideoIA(id) {
  return post(`${BASE}/${id}/avanzar`)
}

/** Para "descarga_pendiente": pide un enlace nuevo al proveedor y copia el video. */
export async function reintentarDescargaVideoIA(id) {
  return post(`${BASE}/${id}/reintentar-descarga`)
}

/** Cancela el trabajo y pide al proveedor borrar el render. */
export async function cancelarTrabajoVideoIA(id) {
  return post(`${BASE}/${id}/cancelar`)
}

/** Crea el video del manual y enlaza el trabajo. Devuelve { trabajo, video }. */
export async function publicarTrabajoVideoIA(id, { titulo, seccion_id, capitulo, seccion, subseccion }) {
  return post(`${BASE}/${id}/publicar`, { titulo, seccion_id, capitulo, seccion, subseccion })
}

export async function eliminarTrabajoVideoIA(id) {
  return fetch(`${BASE}/${id}`, { method: 'DELETE', headers: authHeaders() }).then(parseApiResponse)
}
