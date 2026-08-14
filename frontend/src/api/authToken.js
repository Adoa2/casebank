// frontend/src/api/authToken.js

const TOKEN_KEY = 'casebank_token'
const USERNAME_KEY = 'casebank_username'
const ROLE_KEY = 'casebank_role'

export const UNAUTHORIZED_EVENT = 'casebank:unauthorized'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY)
}

// Rol como entero (0 = usuario normal, 1 = admin, 2 = privilegio mayor).
export function getRole() {
  const raw = localStorage.getItem(ROLE_KEY)
  return raw !== null ? Number(raw) : 0
}

// Se llama con la respuesta cruda de POST /api/auth/login.
export function setAuthData({ access_token, username, role }) {
  if (access_token) localStorage.setItem(TOKEN_KEY, access_token)
  if (username !== undefined && username !== null) localStorage.setItem(USERNAME_KEY, username)
  if (role !== undefined && role !== null) localStorage.setItem(ROLE_KEY, String(role))
}

export function clearAuthData() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USERNAME_KEY)
  localStorage.removeItem(ROLE_KEY)
}

export function authHeaders(extra = {}) {
  const token = getToken()
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function handleUnauthorized() {
  clearAuthData()
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
}

export async function parseApiResponse(res) {
  if (res.status === 401) {
    handleUnauthorized()
    throw new Error('Tu sesión expiró. Por favor, inicia sesión nuevamente.')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const fallback = 'Ocurrió un error al comunicarse con el servidor.'

    if (typeof data.detail === 'string') {
      throw new Error(data.detail)
    }
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      throw new Error(data.detail[0]?.msg || fallback)
    }
    throw new Error(fallback)
  }

  return res.json()
}