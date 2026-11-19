// --- Campos de un video formativo ---
// La API de videos (schemas.VideoResponse) expone la direccion del video
// como "enlace" y la fecha de creacion como "creado_en". Todo componente
// que lea la direccion o la fecha de un video debe pasar por estas
// funciones en vez de acceder al campo directamente.
export function obtenerEnlaceVideo(video) {
  const enlace = video?.enlace ?? ''
  return typeof enlace === 'string' ? enlace.trim() : ''
}

export function obtenerFechaCreacionVideo(video) {
  return video?.creado_en ?? null
}
// --- fin campos de un video formativo ---

// --- Deteccion del tipo de reproductor ---
// Los IDs de YouTube tienen 11 caracteres [A-Za-z0-9_-]. Se aceptan:
//   youtu.be/ID, youtube.com/watch?v=ID, youtube.com/shorts/ID,
//   youtube.com/embed/ID y youtube.com/live/ID
// con o sin parametros extra (?si=..., &t=..., etc.) y con o sin
// subdominio (www., m.). Devuelve null si el enlace no es de YouTube o
// si el ID no tiene un formato valido.
const PATRON_ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/

export function obtenerIdYoutube(enlace) {
  let u
  try {
    u = new URL(enlace)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '')
  const partes = u.pathname.split('/').filter(Boolean)
  let id = null

  if (host === 'youtu.be') {
    id = partes[0]
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (partes[0] === 'watch') id = u.searchParams.get('v')
    else if (['shorts', 'embed', 'live'].includes(partes[0])) id = partes[1]
  }

  return id && PATRON_ID_YOUTUBE.test(id) ? id : null
}

// Archivos que <video> puede reproducir directamente: extensiones de video
// conocidas o cualquier objeto de Supabase Storage (los videos generados
// por IA se guardan ahi, a veces sin extension visible en la ruta).
const EXTENSIONES_VIDEO = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i

function esArchivoDeVideo(u) {
  return EXTENSIONES_VIDEO.test(u.pathname) || u.pathname.includes('/storage/v1/object/')
}

// Los enlaces compartidos de Dropbox apuntan a una pagina HTML; cambiando
// el host a dl.dropboxusercontent.com se obtiene el archivo en crudo.
function normalizarDropbox(u) {
  if (!u.hostname.includes('dropbox.com')) return u
  const copia = new URL(u.toString())
  copia.hostname = 'dl.dropboxusercontent.com'
  copia.searchParams.delete('dl')
  return copia
}

// Decide que etiqueta debe usar el reproductor para un enlace:
//   { tipo: 'youtube', src }  -> <iframe> con https://www.youtube.com/embed/ID
//   { tipo: 'archivo', src }  -> <video controls>
//   { tipo: 'externo', src }  -> URL valida que no se puede incrustar
//                                (se ofrece abrirla en otra pestana)
//   { tipo: 'invalido' }      -> enlace vacio o mal formado
export function clasificarEnlaceVideo(enlace) {
  if (!enlace) return { tipo: 'invalido' }

  const idYoutube = obtenerIdYoutube(enlace)
  if (idYoutube) return { tipo: 'youtube', src: `https://www.youtube.com/embed/${idYoutube}` }

  let u
  try {
    u = new URL(enlace)
  } catch {
    return { tipo: 'invalido' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { tipo: 'invalido' }

  // Un enlace de YouTube que llego hasta aqui tiene un ID mal formado.
  if (/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname)) return { tipo: 'invalido' }

  const normalizado = normalizarDropbox(u)
  if (esArchivoDeVideo(normalizado) || normalizado !== u) return { tipo: 'archivo', src: normalizado.toString() }

  return { tipo: 'externo', src: u.toString() }
}
// --- fin deteccion del tipo de reproductor ---
