import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from './authToken'

export async function fetchManualStructure() {
  const res = await fetch(`${API_BASE_URL}/api/manual`, {
    headers: authHeaders(),
  })

  return parseApiResponse(res)
}