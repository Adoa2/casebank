import { useMemo, useState } from 'react'
import ImageLightbox from './ImageLightbox'
import AuthImage from './AuthImage'
import WelcomeCarousel from './WelcomeCarousel'

const IMG_MARKER_REGEX = /(\[IMG:([^\]]+)\])/g
const LINEA_NUMERO_REGEX = /^\d{1,4}$/

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

    // Tanto el JSON anterior (un salto por bloque) como el nuevo (doble
    // salto por párrafo) terminan aquí convertidos en párrafos limpios.
    const bloques = segmento.split(/\n+/)
    for (const bloque of bloques) {
      const texto = bloque.replace(/\s+/g, ' ').trim()
      if (!texto) continue

      if (paginasValidas.has(texto) && LINEA_NUMERO_REGEX.test(texto)) {
        partes.push({ tipo: 'pagina', valor: texto })
        continue
      }

      // El encabezado del PDF suele repetirse como primera línea del
      // contenido; el título ya se muestra en la tarjeta superior.
      if (texto.toLocaleLowerCase('es') === (titulo || '').trim().toLocaleLowerCase('es')) {
        continue
      }

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
  return /[.!?;:]$/.test(texto.trim())
}

function agruparPartes(partes) {
  const resultado = []
  let index = 0

  while (index < partes.length) {
    const parte = partes[index]
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

      contenido.push(actual)
      if (actual.tipo === 'imagen') contieneImagen = true
      index += 1

      // Una oración puede quedar dividida por varios controles gráficos.
      // Se cierra el flujo cuando vuelve a encontrarse texto con cierre
      // gramatical después de al menos una imagen.
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

export default function ManualContent({ chapter, subchapter, onGoHome }) {
  const [imagenActiva, setImagenActiva] = useState(null)

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
          <div className="flex shrink-0 items-center gap-2">
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
                        {esItem && <span>{primerElemento.valor} </span>}
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
                              {elemento.valor}{' '}
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
                      <p className="min-w-0 flex-1">{parte.valor}</p>
                    </div>
                  )
                }

                return (
                  <p key={`texto-${index}`} className="mb-4 text-[15px] leading-7 text-slate last:mb-0">
                    {parte.valor}
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
    </main>
  )
}
