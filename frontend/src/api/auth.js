import { API_BASE_URL } from '../config'

async function parseError(res, fallback) {
  const data = await res.json().catch(() => ({}))
  return new Error(data.detail || fallback)
}

// POST /auth/login 
export async function login(username, password) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }),
  })

  if (!res.ok) {
    throw await parseError(res, 'Credenciales incorrectas.')
  }

  return res.json()
}

// POST /auth/register 
export async function register(username, email, password) {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  })

  if (!res.ok) {
    throw await parseError(res, 'No se pudo crear la cuenta.')
  }

  return res.json()
}

// POST /auth/forgot-password 
export async function forgotPassword(username, email) {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email }),
  })

  if (!res.ok) {
    throw await parseError(res, 'No se pudo procesar la solicitud.')
  }

  return res.json()
}

// POST /auth/reset-password 
export async function resetPassword(username, code, newPassword) {
  const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, code, new_password: newPassword }),
  })

  if (!res.ok) {
    throw await parseError(res, 'Código inválido o vencido.')
  }

  return res.json()
}
