// frontend/src/api/authToken.js
//
// El JWT se guarda en localStorage bajo la key 'casebank_token' (ver App.jsx,
// donde se lee para inicializar el estado 'authenticated' y se borra en logout).
// Desde que /api/auth/login devuelve también username y role, se guardan bajo
// 'casebank_username' y 'casebank_role' para poder mostrar el botón de admin
// en el Header sin tener que decodificar el JWT en el frontend.

const TOKEN_KEY = 'casebank_token'
const USERNAME_KEY = 'casebank_username'
const ROLE_KEY = 'casebank_role'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY)
}

// Rol como entero (0 = usuario normal, 1 = admin, 2 = privilegio mayor).
// Si no hay nada guardado (usuario viejo con sesión previa a este cambio), asume 0.
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