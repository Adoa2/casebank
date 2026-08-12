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

export async function listUsers() {
  const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo cargar la lista de usuarios.')
  return res.json()
}

export async function createUser(data) {
  const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo crear el usuario.')
  return res.json()
}

export async function updateUser(id, data) {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo actualizar el usuario.')
  return res.json()
}

export async function deleteUser(id) {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw await parseError(res, 'No se pudo eliminar el usuario.')
  return res.json()
}