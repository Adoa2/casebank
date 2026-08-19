import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from './authToken'

export async function listVideos() {
  const res = await fetch(`${API_BASE_URL}/api/videos`, {
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

export async function listVideosBySeccion(seccionId) {
  const res = await fetch(`${API_BASE_URL}/api/videos/por-seccion/${seccionId}`, {
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}

export async function createVideo(data) {
  const res = await fetch(`${API_BASE_URL}/api/videos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

export async function updateVideo(id, data) {
  const res = await fetch(`${API_BASE_URL}/api/videos/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  return parseApiResponse(res)
}

export async function deleteVideo(id) {
  const res = await fetch(`${API_BASE_URL}/api/videos/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  return parseApiResponse(res)
}