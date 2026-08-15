import { API_BASE_URL } from '../config'
import { authHeaders } from './authToken'

async function parseError(res, fallback) {
  const data = await res.json().catch(() => ({}))

  if (typeof data.detail === 'string') {
    return new Error(data.detail)
  }

  if (Array.isArray(data.detail) && data.detail.length > 0) {
    return new Error(data.detail[0]?.msg || fallback)
  }

  return new Error(fallback)
}

export async function listVideos() {
  const res = await fetch(`${API_BASE_URL}/api/videos`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo cargar la lista de videos.')
  return res.json()
}

export async function listVideosBySeccion(seccionId) {
  const res = await fetch(`${API_BASE_URL}/api/videos/por-seccion/${seccionId}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw await parseError(res, 'No se pudieron cargar los videos de esta sección.')
  return res.json()
}

export async function createVideo(data) {
  const res = await fetch(`${API_BASE_URL}/api/videos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo crear el video.')
  return res.json()
}

export async function updateVideo(id, data) {
  const res = await fetch(`${API_BASE_URL}/api/videos/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo actualizar el video.')
  return res.json()
}

export async function deleteVideo(id) {
  const res = await fetch(`${API_BASE_URL}/api/videos/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo eliminar el video.')
  return res.json()
}