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

export async function listErrors() {
  const res = await fetch(`${API_BASE_URL}/api/errors`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo cargar la lista de errores.')
  return res.json()
}

export async function listPendingErrors() {
  const res = await fetch(`${API_BASE_URL}/api/errors/pendientes`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo cargar los errores pendientes.')
  return res.json()
}

export async function createError(data) {
  const res = await fetch(`${API_BASE_URL}/api/errors`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo crear el error.')
  return res.json()
}

export async function reviewError(id, aprobar) {
  const res = await fetch(`${API_BASE_URL}/api/errors/${id}/revisar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ aprobar }),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo revisar el error.')
  return res.json()
}