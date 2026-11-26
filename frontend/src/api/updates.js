// CRUD de documentos de actualización del manual: listado, creación, edición y reemplazo de PDF.
import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from './authToken'

export async function listUpdates() {
  const response = await fetch(`${API_BASE_URL}/api/updates`, { headers: authHeaders() })
  return parseApiResponse(response)
}

/** Crea un documento de actualización enviando los campos y el PDF como multipart/form-data. */
export async function createUpdate(data) {
  const form = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) form.append(key, value)
  })
  const response = await fetch(`${API_BASE_URL}/api/updates`, {
    method: 'POST', headers: authHeaders(), body: form,
  })
  return parseApiResponse(response)
}

/** Actualiza los metadatos (encabezado, descripción, etc.) de un documento de actualización. */
export async function updateUpdate(id, data) {
  const response = await fetch(`${API_BASE_URL}/api/updates/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(response)
}

/** Reemplaza el PDF de un documento de actualización existente y re-indexa sus fragmentos. */
export async function replaceUpdatePdf(id, file) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE_URL}/api/updates/${id}/pdf`, {
    method: 'POST', headers: authHeaders(), body: form,
  })
  return parseApiResponse(response)
}

/** Elimina un documento de actualización y su PDF del almacenamiento de archivos. */
export async function deleteUpdate(id) {
  const response = await fetch(`${API_BASE_URL}/api/updates/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  })
  return parseApiResponse(response)
}
