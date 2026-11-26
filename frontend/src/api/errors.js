// CRUD de errores frecuentes, revisión (aprobar/rechazar) y subida de evidencia de imagen.
import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from './authToken'

export async function listErrors() {
  const res = await fetch(`${API_BASE_URL}/api/errors`, {
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

/** Devuelve solo los errores en estado 'pendiente', para la cola de revisión. */
export async function listPendingErrors() {
  const res = await fetch(`${API_BASE_URL}/api/errors/pendientes`, {
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

/** Crea un error frecuente en estado 'pendiente'. */
export async function createError(data) {
  const res = await fetch(`${API_BASE_URL}/api/errors`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

/** Aprueba o rechaza un error pendiente. Si se aprueba, se indexa para el RAG. */
export async function reviewError(id, aprobar) {
  const res = await fetch(`${API_BASE_URL}/api/errors/${id}/revisar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ aprobar }),
  })
  return parseApiResponse(res)
}

/** Actualiza los campos de un error existente. Si estaba aprobado, re-indexa el embedding. */
export async function updateError(id, data) {
  const res = await fetch(`${API_BASE_URL}/api/errors/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

/** Elimina un error y sus embeddings (ON DELETE CASCADE). */
export async function deleteError(id) {
  const res = await fetch(`${API_BASE_URL}/api/errors/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

/** Sube una imagen de evidencia al almacenamiento de archivos del backend y devuelve su URL pública. */
export async function uploadImagenError(file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${API_BASE_URL}/api/errors/upload-imagen`, {
    method: 'POST',
    headers: authHeaders(), 
    body: formData,
  })
  return parseApiResponse(res) // { url }
}