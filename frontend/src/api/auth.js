import { API_BASE_URL } from '../config'

const FIELD_MESSAGES = {
  new_password: 'La contraseña debe tener al menos 8 caracteres.',
  code: 'El código debe tener 6 dígitos.',
  username: 'El usuario es obligatorio.',
  email: 'El correo no es válido.',
  password: 'La contraseña debe tener al menos 8 caracteres.',
}

async function parseError(res, fallback) {
  const data = await res.json().catch(() => ({}))

  if (typeof data.detail === 'string') {
    return new Error(data.detail)
  }

  if (Array.isArray(data.detail) && data.detail.length > 0) {
    const field = data.detail[0]?.loc?.[data.detail[0].loc.length - 1]
    return new Error(FIELD_MESSAGES[field] || fallback)
  }

  return new Error(fallback)
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