import { API_BASE_URL } from '../config'

async function parseError(res, fallback) {
  const data = await res.json().catch(() => ({}))

  if (Array.isArray(data.detail)) {
    const msg = data.detail
      .map((e) => e.msg || JSON.stringify(e))
      .join(' | ')
    return new Error(msg || fallback)
  }

  return new Error(data.detail || fallback)
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }),
  })

  if (!res.ok) {
    throw await parseError(res, 'Credenciales incorrectas.')
  }

  return res.json()
}

export async function register(username, email, password) {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  })

  if (!res.ok) {
    throw await parseError(res, 'No se pudo crear la cuenta.')
  }

  return res.json()
}

export async function forgotPassword(username, email) {
  const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email }),
  })

  if (!res.ok) {
    throw await parseError(res, 'No se pudo procesar la solicitud.')
  }

  return res.json()
}

export async function resetPassword(username, code, newPassword) {
  const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, code, new_password: newPassword }),
  })

  if (!res.ok) {
    throw await parseError(res, 'Código inválido o vencido.')
  }

  return res.json()
}