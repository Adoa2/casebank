// Pruebas de clasificacion y validacion de enlaces de video. Ejecutar con: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarEnlaceVideo, esEnlaceVideoValido, esRutaRelativa, resolverEnlace } from './videoEnlace.js'

const MP4_SUPABASE = 'https://abc123.supabase.co/storage/v1/object/public/videos-generados/trabajo-7-k3j9x0a1b2c3d4e5.mp4'
const MP4_SUPABASE_SIN_EXTENSION = 'https://abc123.supabase.co/storage/v1/object/public/videos-generados/objeto'
const RUTA_LOCAL = '/api/archivos/videos-generados/trabajo-7-k3j9x0a1b2c3d4e5.mp4'

test('YouTube se incrusta con iframe', () => {
  assert.deepEqual(clasificarEnlaceVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), {
    tipo: 'youtube',
    src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  })
  assert.equal(clasificarEnlaceVideo('https://youtu.be/dQw4w9WgXcQ?si=x').tipo, 'youtube')
  assert.equal(clasificarEnlaceVideo('https://www.youtube.com/watch?v=corto').tipo, 'invalido')
})

test('Dropbox se reproduce como archivo desde dl.dropboxusercontent.com', () => {
  const r = clasificarEnlaceVideo('https://www.dropbox.com/s/abc/video.mp4?dl=0')
  assert.equal(r.tipo, 'archivo')
  assert.equal(r.src, 'https://dl.dropboxusercontent.com/s/abc/video.mp4')
})

test('mp4 absoluto de Supabase se sigue reproduciendo como archivo', () => {
  assert.deepEqual(clasificarEnlaceVideo(MP4_SUPABASE), { tipo: 'archivo', src: MP4_SUPABASE })
  assert.equal(clasificarEnlaceVideo(MP4_SUPABASE_SIN_EXTENSION).tipo, 'archivo')
})

test('ruta relativa /api/archivos se resuelve contra API_BASE_URL', () => {
  assert.deepEqual(clasificarEnlaceVideo(RUTA_LOCAL, 'https://api.casebank.test'), {
    tipo: 'archivo',
    src: `https://api.casebank.test${RUTA_LOCAL}`,
  })
  // Con barra final en API_BASE_URL no se duplica la barra.
  assert.equal(clasificarEnlaceVideo(RUTA_LOCAL, 'https://api.casebank.test/').src, `https://api.casebank.test${RUTA_LOCAL}`)
})

test('ruta relativa sin API_BASE_URL se resuelve contra el dominio actual', () => {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { value: { origin: 'https://casebank.empresa.test' }, configurable: true })
  try {
    assert.deepEqual(clasificarEnlaceVideo(RUTA_LOCAL), { tipo: 'archivo', src: `https://casebank.empresa.test${RUTA_LOCAL}` })
  } finally {
    if (anterior) Object.defineProperty(globalThis, 'location', anterior)
    else delete globalThis.location
  }
})

test('ruta relativa sin base disponible es invalida (no revienta)', () => {
  assert.equal(resolverEnlace(RUTA_LOCAL, ''), null)
  assert.equal(clasificarEnlaceVideo(RUTA_LOCAL).tipo, 'invalido')
})

test('enlaces no validos', () => {
  assert.equal(clasificarEnlaceVideo('').tipo, 'invalido')
  assert.equal(clasificarEnlaceVideo('video.mp4').tipo, 'invalido')
  assert.equal(clasificarEnlaceVideo('javascript:alert(1)').tipo, 'invalido')
  assert.equal(clasificarEnlaceVideo('//otro-dominio.test/video.mp4', 'https://api.casebank.test').tipo, 'invalido')
  assert.equal(clasificarEnlaceVideo('https://vimeo.com/123').tipo, 'externo')
})

test('formulario: publicar un video de IA con ruta relativa ya no queda bloqueado', () => {
  // VideoFormModal.handleSubmit usa esEnlaceVideoValido para aceptar o rechazar el enlace.
  assert.equal(esEnlaceVideoValido(RUTA_LOCAL), true)
  assert.equal(esEnlaceVideoValido(`  ${RUTA_LOCAL}  `), true)
  assert.equal(esEnlaceVideoValido(MP4_SUPABASE), true)
  assert.equal(esEnlaceVideoValido('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true)
  assert.equal(esEnlaceVideoValido('ftp://x.test/v.mp4'), false)
  assert.equal(esEnlaceVideoValido('//otro-dominio.test/v.mp4'), false)
  assert.equal(esEnlaceVideoValido('video.mp4'), false)
  assert.equal(esRutaRelativa('/api/archivos/x.mp4'), true)
})
