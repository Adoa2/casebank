import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from './authToken'

export async function listErrors() {
  const res = await fetch(`${API_BASE_URL}/api/errors`, {
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

export async function listPendingErrors() {
  const res = await fetch(`${API_BASE_URL}/api/errors/pendientes`, {
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

export async function createError(data) {
  const res = await fetch(`${API_BASE_URL}/api/errors`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

export async function reviewError(id, aprobar) {
  const res = await fetch(`${API_BASE_URL}/api/errors/${id}/revisar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ aprobar }),
  })
  return parseApiResponse(res)
}

export async function updateError(id, data) {
  const res = await fetch(`${API_BASE_URL}/api/errors/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

export async function deleteError(id) {
  const res = await fetch(`${API_BASE_URL}/api/errors/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

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