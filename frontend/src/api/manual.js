import { API_BASE_URL } from '../config'
import { authHeaders } from './authToken'

export async function fetchManualStructure() {
  const res = await fetch(`${API_BASE_URL}/api/manual`, {
    headers: authHeaders(),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'No se pudo cargar la estructura del manual.')
  }

  return res.json()
}