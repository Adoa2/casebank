// frontend/src/api/authToken.js
//
// El JWT se guarda en localStorage bajo la key 'casebank_token' (ver App.jsx,
// donde se lee para inicializar el estado 'authenticated' y se borra en logout).

const TOKEN_KEY = 'casebank_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function authHeaders(extra = {}) {
  const token = getToken()
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}