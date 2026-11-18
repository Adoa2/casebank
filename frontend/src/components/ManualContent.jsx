// Renderiza el contenido de una sección del manual: texto con negritas, imágenes inline,
// listas detectadas automáticamente, rutas de navegación del sistema y galería de videos.
import { useEffect, useMemo, useState } from 'react'
import ImageLightbox from './ImageLightbox'
import AuthImage from './AuthImage'
import WelcomeCarousel from './WelcomeCarousel'
import VideoGalleryModal from './VideoGalleryModal'
import { listVideosBySeccion } from '../api/videos'

const IMG_MARKER_REGEX = /(\[IMG:([^\]]+)\])/g
const LINEA_NUMERO_REGEX = /^\d{1,4}$/
const PIE_IMAGEN_REGEX = /^[Ii]lustraci[oó]n\s+\d+/
// Inicio de ítem de lista: "1. " "22. " "1) " "a. " "a) " "- "
// No coincide con secciones "3.1.1.2." porque el 2.º token tras el punto NO es espacio.
const LISTA_ITEM_RE = /^(\d{1,2}[.)]\s|[a-z][.)]\s|-\s)/

// Detección de rutas de acceso al sistema.
// Separadores reconocidos:
//   · glifos de flecha (→ ➔ ►  ➡)
//   · "->" y "=>" ASCII
//   · " > " con espacios
//   · "letra>letra" SIN espacios (ej: Cooperativista>Menú), no parte de -> => >=
const FLECHA_RX = /→|➔|►|►|➡|(?<![=-])->(?!=)|(?<!-)=>(?!=)|\s>\s|(?<=[A-Za-záéíóúÁÉÍÓÚüÜñÑ])>(?=[A-Za-záéíóúÁÉÍÓÚüÜñÑ])/gu
const MENU_VOCAB_RX = /\b(?:Men[uú]|Pesta[nñ]a|Vi[nñ]eta|M[oó]dulo|Cooperativ|Afiliaci|Atenci[oó]n|Seleccionar|Configuraci|Administraci)\b/i
const RUTA_PHRASE_RX = /\bruta\b/i
const ROUTE_OPENER_RE = /^(?:Para\s+ingresar[^:]{0,80}siguiente\s+ruta|Su\s+ruta\s+es|Ruta):\s*/i

/** Elimina marcadores **negrita** para comparaciones de texto. */
function stripNegrita(texto) {
  return texto.replace(/\*\*([^*]+)\*\*/g, '$1')
}

/** Detecta si un texto es una ruta de acceso al sistema. */
function esRutaAcceso(texto) {
  const flechas = (texto.match(FLECHA_RX) || []).length
  if (flechas < 1) return false
  return MENU_VOCAB_RX.test(texto) || RUTA_PHRASE_RX.test(texto)
}

/** Convierte **texto** en <strong>texto</strong> para renderizado. */
function parsearNegrita(texto) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/)
  return partes.map((parte, i) => {
    if (parte.startsWith('**') && parte.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {parte.slice(2, -2)}
        </strong>
      )
    }
    return parte
  })
}

function normalizarContenido(contenido, titulo, paginaInicio, paginaFin) {
  if (!contenido) return []

  const paginasValidas = new Set()
  if (paginaInicio != null) {
    const fin = paginaFin || paginaInicio
    for (let pagina = paginaInicio; pagina <= fin; pagina += 1) {
      paginasValidas.add(String(pagina))
    }
  }

  const partes = []
  let numeroItem = 0
  const segmentos = contenido.replace(/\r\n?/g, '\n').split(IMG_MARKER_REGEX)

  for (let i = 0; i < segmentos.length; i += 1) {
    const segmento = segmentos[i]
    if (!segmento) continue

    if (segmento.startsWith('[IMG:')) {
      partes.push({ tipo: 'imagen', valor: segmentos[i + 1] })
      i += 1
      continue
    }

    const bloques = segmento.split(/\n+/)
    for (const bloque of bloques) {
      const texto = bloque.replace(/\s+/g, ' ').trim()
      if (!texto) continue

      // Texto sin marcadores de negrita, para comparaciones
      const textoLimpio = stripNegrita(texto)

      if (paginasValidas.has(textoLimpio) && LINEA_NUMERO_REGEX.test(textoLimpio)) {
        partes.push({ tipo: 'pagina', valor: textoLimpio })
        continue
      }

      if (textoLimpio.toLocaleLowerCase('es') === (titulo || '').trim().toLocaleLowerCase('es')) {
        continue
      }

      if (PIE_IMAGEN_REGEX.test(textoLimpio)) {
        continue
      }

      // Ítems de lista del nuevo extractor ("1. texto", "- texto")
      // Usar textoLimpio para detectar marcadores en párrafos completamente en negrita
      // ("**3. Encabezado**" → textoLimpio="3. Encabezado" → sí hace match)
      const listaMatch = LISTA_ITEM_RE.exec(textoLimpio)
      if (listaMatch) {
        const marcador = listaMatch[1]
        // Preservar negritas: si todo el párrafo era negrita, el contenido también lo es
        const contenido = texto === `**${textoLimpio}**`
          ? `**${textoLimpio.slice(marcador.length)}**`
          : texto.slice(marcador.length)
        partes.push({
          tipo: 'lista_item',
          marcador,
          contenido,
          esNumero: /^\d/.test(marcador),
        })
        continue
      }

      // Rutas de acceso al sistema (flechas + vocabulario de menú o "ruta")
      if (esRutaAcceso(textoLimpio)) {
        partes.push({ tipo: 'ruta', valor: texto })
        continue
      }

      // Compatibilidad con ítems ##LIST## del extractor anterior
      if (/^#+\s*/.test(texto)) {
        numeroItem += 1
        partes.push({
          tipo: 'item',
          valor: texto.replace(/^#+\s*/, ''),
          numero: numeroItem,
        })
        continue
      }

      partes.push({ tipo: 'texto', valor: texto })
    }
  }

  return partes
}

function terminaOracion(texto) {
  return /[.!?;:]$/.test(stripNegrita(texto).trim())
}

function agruparPartes(partes) {
  const resultado = []
  let index = 0

  while (index < partes.length) {
    const parte = partes[index]

    // Agrupar ítems de lista consecutivos en un bloque tipo 'lista'
    if (parte.tipo === 'lista_item') {
      const items = [parte]
      index += 1
      while (index < partes.length && partes[index].tipo === 'lista_item') {
        items.push(partes[index])
        index += 1
      }
      resultado.push({ tipo: 'lista', items })
      continue
    }

    const esTextoOItem = parte.tipo === 'texto' || parte.tipo === 'item'
    const iniciaFlujoConImagen =
      parte.tipo === 'imagen' ||
      (esTextoOItem && partes[index + 1]?.tipo === 'imagen')

    if (!iniciaFlujoConImagen) {
      resultado.push(parte)
      index += 1
      continue
    }

    const contenido = []
    let contieneImagen = false

    while (index < partes.length && partes[index].tipo !== 'pagina') {
      const actual = partes[index]
      if (actual.tipo === 'item' && contenido.length > 0) break
      // No absorber ítems de lista ni rutas en el flujo de imagen
      if (actual.tipo === 'lista_item') break
      if (actual.tipo === 'ruta') break

      contenido.push(actual)
      if (actual.tipo === 'imagen') contieneImagen = true
      index += 1

      if (
        contieneImagen &&
        (actual.tipo === 'texto' || actual.tipo === 'item') &&
        terminaOracion(actual.valor) &&
        partes[index]?.tipo !== 'imagen'
      ) {
        break
      }
    }

    resultado.push({ tipo: 'flujo', contenido })
  }

  return resultado
}

function ImagenManual({ nombre, titulo, onZoom, integrada = false }) {
  const [dimensions, setDimensions] = useState(null)
  // Iconos decorativos (≤64px) se omiten; controles pequeños se muestran inline
  const esIconoDecorativo =
    dimensions && dimensions.width <= 64 && dimensions.height <= 64
  const esControlPequeno =
    integrada && dimensions && dimensions.width <= 260 && dimensions.height <= 120

  if (esIconoDecorativo) return null

  return (
    <figure
      className={
        esControlPequeno
          ? 'mx-2 my-1 inline-flex overflow-hidden rounded-lg border border-line bg-paper align-middle'
          : 'mx-auto my-6 block overflow-hidden rounded-xl border border-line bg-paper'
      }
      style={{
        maxWidth: dimensions
          ? `${Math.min(dimensions.width + (esControlPequeno ? 8 : 24), 900)}px`
          : '900px',
      }}
    >
      <button
        type="button"
        onClick={() => onZoom(nombre)}
        className={`group w-full cursor-zoom-in bg-white text-left ${esControlPequeno ? 'p-1' : 'block p-3'}`}
        aria-label={`Ampliar imagen de ${titulo}`}
        title={esControlPequeno ? 'Haz clic para ampliar' : undefined}
      >
        <AuthImage
          nombreArchivo={nombre}
          alt={`Referencia visual de ${titulo}`}
          onDimensions={setDimensions}
        />
        {!esControlPequeno && (
          <span className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-brand-blue">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4 4M11 8v6M8 11h6" />
            </svg>
            Haz clic para ampliar
          </span>
        )}
      </button>
    </figure>
  )
}

/** Renderiza el contenido de una sección del manual: texto, imágenes autenticadas y galería de videos. */
export default function ManualContent({ chapter, subchapter, onGoHome }) {
  const [imagenActiva, setImagenActiva] = useState(null)
  const [videos, setVideos] = useState([])
  const [galeriaAbierta, setGaleriaAbierta] = useState(false)

  useEffect(() => {
    let cancelado = false
    setVideos([])
    setGaleriaAbierta(false)

    if (!subchapter?.seccionId) return

    async function cargarVideos() {
      try {
        const data = await listVideosBySeccion(subchapter.seccionId)
        if (!cancelado) setVideos(data)
      } catch {
        if (!cancelado) setVideos([])
      }
    }

    cargarVideos()
    return () => {
      cancelado = true
    }
  }, [subchapter?.seccionId])

  const partes = useMemo(
    () =>
      normalizarContenido(
        subchapter?.contenido,
        subchapter?.title,
        subchapter?.paginaInicio,
        subchapter?.paginaFin
      ),
    [subchapter?.contenido, subchapter?.title, subchapter?.paginaInicio, subchapter?.paginaFin]
  )
  const bloques = useMemo(() => agruparPartes(partes), [partes])

  if (!subchapter) {
    return (
      <div className="flex-1 min-w-0 overflow-y-auto px-3 py-4 manual-bg sm:px-6">
        <WelcomeCarousel />
      </div>
    )
  }

  const mostrarRangoPaginas =
    subchapter.paginaFin && subchapter.paginaFin !== subchapter.paginaInicio
      ? `${subchapter.paginaInicio} – ${subchapter.paginaFin}`
      : subchapter.paginaInicio

  const imagenesInline = new Set(partes.filter((parte) => parte.tipo === 'imagen').map((parte) => parte.valor))
  const imagenesSinInline = (subchapter.imagenes || []).filter((nombre) => !imagenesInline.has(nombre))

  return (
    <main className="flex-1 min-w-0 overflow-y-auto px-3 py-4 manual-bg sm:px-8 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-line bg-white px-4 py-4 shadow-sm sm:flex-row sm:px-5">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">{chapter?.title}</h1>
            <p className="mt-1 text-base font-medium text-brand-blue">{subchapter.title}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onGoHome}
              title="Volver al inicio y limpiar la selección"
              className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-brand-blue transition hover:border-brand-blue/30 hover:bg-blue-100 focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="m3 11 9-8 9 8" />
                <path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />
              </svg>
              Inicio
            </button>

            {videos.length > 0 && (
              <button
                type="button"
                onClick={() => setGaleriaAbierta(true)}
                title="Ver videos formativos de esta sección"
                className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-brand-blue transition hover:border-brand-blue/30 hover:bg-blue-100 focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="5" width="14" height="14" rx="2" />
                  <path d="m21 8-4 3 4 3V8Z" />
                </svg>
                Ver videos formativos
              </button>
            )}

            {subchapter.paginaInicio != null && (
              <span className="shrink-0 whitespace-nowrap rounded-md border border-line px-2 py-1 text-xs text-slate">
                Página {mostrarRangoPaginas}
              </span>
            )}
          </div>
        </header>

        {bloques.length > 0 ? (
          <article className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            <div className="px-5 py-6 sm:px-7">
              {bloques.map((parte, index) => {
                if (parte.tipo === 'pagina') {
                  return (
                    <div key={`pagina-${index}`} className="my-6 flex items-center gap-3" aria-label={`Página ${parte.valor}`}>
                      <span className="h-px flex-1 bg-line" />
                      <span className="text-xs font-medium text-brand-blue">Página {parte.valor}</span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  )
                }

                if (parte.tipo === 'imagen') {
                  return (
                    <ImagenManual
                      key={`imagen-${parte.valor}-${index}`}
                      nombre={parte.valor}
                      titulo={subchapter.title}
                      onZoom={setImagenActiva}
                    />
                  )
                }

                // Bloque de lista (ítems "1. " o "- " del nuevo extractor)
                if (parte.tipo === 'lista') {
                  return (
                    <div key={`lista-${index}`} className="mb-4 space-y-2 text-[15px] leading-7 text-slate last:mb-0">
                      {parte.items.map((item, iIdx) => (
                        <div key={iIdx} className="flex items-start gap-3">
                          {item.esNumero ? (
                            <span className="mt-0.5 shrink-0 min-w-[1.75rem] text-right text-sm font-semibold text-slate">
                              {item.marcador.trim()}
                            </span>
                          ) : (
                            <span className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-slate" aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1">{parsearNegrita(item.contenido)}</span>
                        </div>
                      ))}
                    </div>
                  )
                }

                if (parte.tipo === 'flujo') {
                  const primerElemento = parte.contenido[0]
                  const esItem = primerElemento?.tipo === 'item'
                  const contenidoFlujo = esItem ? parte.contenido.slice(1) : parte.contenido

                  return (
                    <div
                      key={`flujo-${index}`}
                      className={`mb-4 text-[15px] leading-7 text-slate last:mb-0 ${esItem ? 'flex items-start gap-3' : ''}`}
                    >
                      {esItem && (
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-blue text-xs font-semibold text-white">
                          {primerElemento.numero}
                        </span>
                      )}
                      <div className={esItem ? 'min-w-0 flex-1' : 'contents'}>
                        {esItem && <span>{parsearNegrita(primerElemento.valor)} </span>}
                        {contenidoFlujo.map((elemento, elementoIndex) =>
                          elemento.tipo === 'imagen' ? (
                            <ImagenManual
                              key={`flujo-imagen-${elemento.valor}-${elementoIndex}`}
                              nombre={elemento.valor}
                              titulo={subchapter.title}
                              onZoom={setImagenActiva}
                              integrada
                            />
                          ) : (
                            <span key={`flujo-texto-${elementoIndex}`}>
                              {parsearNegrita(elemento.valor)}{' '}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )
                }

                if (parte.tipo === 'item') {
                  return (
                    <div key={`item-${index}`} className="mb-4 flex items-start gap-3 text-[15px] leading-7 text-slate last:mb-0">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-blue text-xs font-semibold text-white">
                        {parte.numero}
                      </span>
                      <p className="min-w-0 flex-1">{parsearNegrita(parte.valor)}</p>
                    </div>
                  )
                }

                if (parte.tipo === 'ruta') {
                  const textoRuta = stripNegrita(parte.valor)
                  const matchOpener = ROUTE_OPENER_RE.exec(textoRuta)
                  const cuerpo = matchOpener ? textoRuta.slice(matchOpener[0].length) : textoRuta
                  const pasos = cuerpo
                    .split(/\s*(?:→|➔|►|►|➡|->|=>|>)\s*/)
                    .map((p) => p.trim().replace(/\.$/, ''))
                    .filter(Boolean)
                  return (
                    <div
                      key={`ruta-${index}`}
                      className="mb-4 overflow-hidden rounded-lg border border-slate-200 border-l-4 border-l-brand-blue bg-white shadow-sm last:mb-0"
                    >
                      <div className="px-4 py-3">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand-blue">
                          Ruta de acceso
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] leading-relaxed">
                          {pasos.map((paso, pIdx) => (
                            <span key={pIdx} className="flex items-center gap-1">
                              {pIdx > 0 && (
                                <span className="select-none text-xs text-slate-400" aria-hidden="true">
                                  →
                                </span>
                              )}
                              <span className="font-semibold text-gray-800">
                                {paso}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <p key={`texto-${index}`} className="mb-4 text-[15px] leading-7 text-slate last:mb-0">
                    {parsearNegrita(parte.valor)}
                  </p>
                )
              })}
            </div>
          </article>
        ) : (
          <div className="rounded-xl border border-line bg-white p-5 text-sm leading-relaxed text-slate">
            Esta sección no tiene contenido de texto adicional.
          </div>
        )}

        {imagenesSinInline.length > 0 && (
          <section className="mt-6 rounded-xl border border-line bg-white p-5 shadow-sm">
            <h2 className="font-display mb-3 text-sm font-semibold text-ink">Imágenes relacionadas</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {imagenesSinInline.map((nombre) => (
                <ImagenManual
                  key={nombre}
                  nombre={nombre}
                  titulo={subchapter.title}
                  onZoom={setImagenActiva}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {imagenActiva && <ImageLightbox nombreArchivo={imagenActiva} onClose={() => setImagenActiva(null)} />}
      {galeriaAbierta && <VideoGalleryModal videos={videos} onClose={() => setGaleriaAbierta(false)} />}
    </main>
  )
}
