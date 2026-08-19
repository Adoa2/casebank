import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from './authToken'

export async function listUsers() {
  const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

export async function createUser(data) {
  const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

export async function updateUser(id, data) {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

export async function deleteUser(id) {
  const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}