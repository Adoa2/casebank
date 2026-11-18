// CRUD de usuarios del sistema para el panel de administración.
import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from './authToken'

export async function listUsers() {
  const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

/** Crea un usuario desde el panel administrativo con rol y estado definidos. */
export async function createUser(data) {
  const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

/** Actualiza correo, rol, estado o contraseña de un usuario existente. */
export async function updateUser(id, data) {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

/** Elimina un usuario del sistema. */
export async function deleteUser(id) {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}