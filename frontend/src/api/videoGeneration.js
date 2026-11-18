// TODO: DESHABILITADO TEMPORALMENTE - generación de videos IA
// Todas las funciones de este módulo están comentadas.
// Para reactivar: descomentar las funciones y restaurar los imports en los componentes que las usan.

// import { API_BASE_URL } from '../config'
// import { authHeaders, parseApiResponse } from './authToken'

// export async function subirImagenVideoGeneracion(file) {
//   const formData = new FormData()
//   formData.append('file', file)
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/upload-imagen`, {
//     method: 'POST',
//     headers: authHeaders(),
//     body: formData,
//   })
//   return parseApiResponse(res)
// }

// export async function generarVideo({ titulo, descripcionInconveniente, pasos, puntosAConsiderar }) {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/generar`, {
//     method: 'POST',
//     headers: authHeaders({ 'Content-Type': 'application/json' }),
//     body: JSON.stringify({
//       titulo,
//       descripcion_inconveniente: descripcionInconveniente,
//       pasos,
//       puntos_a_considerar: puntosAConsiderar,
//     }),
//   })
//   return parseApiResponse(res)
// }

// export async function listarJobsVideoGeneracion() {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/`, { headers: authHeaders() })
//   return parseApiResponse(res)
// }

// export async function obtenerEstadoJob(jobId) {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/${jobId}`, { headers: authHeaders() })
//   return parseApiResponse(res)
// }

// export async function reintentarEstadoJob(jobId) {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/${jobId}/reintentar-estado`, {
//     method: 'POST',
//     headers: authHeaders(),
//   })
//   return parseApiResponse(res)
// }

// export async function eliminarJobVideoGeneracion(jobId) {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/${jobId}`, {
//     method: 'DELETE',
//     headers: authHeaders(),
//   })
//   return parseApiResponse(res)
// }

// export async function regenerarJobVideoGeneracion(jobId) {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/${jobId}/regenerar`, {
//     method: 'POST',
//     headers: authHeaders(),
//   })
//   return parseApiResponse(res)
// }

// export async function actualizarJobVideoGeneracion(jobId, { titulo, descripcionInconveniente, pasos, puntosAConsiderar }) {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/${jobId}`, {
//     method: 'PUT',
//     headers: authHeaders({ 'Content-Type': 'application/json' }),
//     body: JSON.stringify({
//       titulo,
//       descripcion_inconveniente: descripcionInconveniente,
//       pasos,
//       puntos_a_considerar: puntosAConsiderar,
//     }),
//   })
//   return parseApiResponse(res)
// }

// export async function cancelarJobVideoGeneracion(jobId) {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/${jobId}/cancelar`, {
//     method: 'POST',
//     headers: authHeaders(),
//   })
//   return parseApiResponse(res)
// }

// export async function listarDisponiblesParaManual() {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/disponibles-para-manual`, {
//     headers: authHeaders(),
//   })
//   return parseApiResponse(res)
// }

// export async function vincularJobAVideo(jobId, videoId) {
//   const res = await fetch(`${API_BASE_URL}/api/video-generation/${jobId}/vincular/${videoId}`, {
//     method: 'POST',
//     headers: authHeaders(),
//   })
//   return parseApiResponse(res)
// }
