import { useState, useMemo } from 'react'
import ImageLightbox from './ImageLightbox'
import AuthImage from './AuthImage'
import WelcomeCarousel from './WelcomeCarousel'

const IMG_MARKER_REGEX = /\[IMG:([^\]]+)\]/g

export default function ManualContent({ chapter, subchapter }) {
  const [imagenActiva, setImagenActiva] = useState(null)

  const partes = useMemo(() => {
    if (!subchapter?.contenido) return []
    const texto = subchapter.contenido
    const resultado = []
    let ultimoIndice = 0
    let match

    IMG_MARKER_REGEX.lastIndex = 0
    while ((match = IMG_MARKER_REGEX.exec(texto)) !== null) {
      if (match.index > ultimoIndice) {
        resultado.push({ tipo: 'texto', valor: texto.slice(ultimoIndice, match.index) })
      }
      resultado.push({ tipo: 'imagen', valor: match[1] })
      ultimoIndice = match.index + match[0].length
    }
    if (ultimoIndice < texto.length) {
      resultado.push({ tipo: 'texto', valor: texto.slice(ultimoIndice) })
    }
    return resultado
  }, [subchapter?.contenido])

  if (!subchapter) {
    return (
      <div className="flex-1 min-w-0 overflow-y-auto px-8 py-10">
        <WelcomeCarousel />
      </div>
    )
  }

  const mostrarRangoPaginas =
    subchapter.paginaFin && subchapter.paginaFin !== subchapter.paginaInicio
      ? `${subchapter.paginaInicio} – ${subchapter.paginaFin}`
      : subchapter.paginaInicio

  // Compatibilidad con secciones que aun no tienen marcadores inline
  // (datos generados antes de este cambio): las imagenes que no aparecen
  // dentro del texto se siguen mostrando en un bloque aparte al final.
  const imagenesInline = new Set(partes.filter((p) => p.tipo === 'imagen').map((p) => p.valor))
  const imagenesSinInline = (subchapter.imagenes || []).filter((nombre) => !imagenesInline.has(nombre))

  return (
    <div className="flex-1 min-w-0 overflow-y-auto px-8 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="font-display text-2xl font-semibold mb-1">{chapter?.title}</h1>
            <p className="text-base text-brand-blue font-medium">{subchapter.title}</p>
          </div>
          {subchapter.paginaInicio != null && (
            <span className="shrink-0 whitespace-nowrap text-xs text-slate border border-line rounded-md px-2 py-1 mt-1">
              Página {mostrarRangoPaginas}
            </span>
          )}
        </div>

        <div className="border border-line rounded-xl p-5 bg-white text-sm text-slate leading-relaxed">
          {partes.length > 0 ? (
            partes.map((parte, i) =>
              parte.tipo === 'texto' ? (
                <span key={i} className="whitespace-pre-line">
                  {parte.valor}
                </span>
              ) : (
                <button
                  key={i}
                  onClick={() => setImagenActiva(parte.valor)}
                  className="inline-flex items-center gap-1 mx-1 my-1 px-2 py-0.5 rounded-md border border-brand-blue/30 text-brand-blue text-xs font-medium hover:bg-brand-blue/5 align-middle"
                >
                  Ver referencia
                </button>
              )
            )
          ) : (
            'Esta sección no tiene contenido de texto adicional.'
          )}
        </div>

        {imagenesSinInline.length > 0 && (
          <div className="mt-6">
            <h2 className="font-display text-sm font-semibold text-ink mb-3">Imágenes relacionadas</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imagenesSinInline.map((nombre) => (
                <AuthImage key={nombre} nombreArchivo={nombre} alt={nombre} />
              ))}
            </div>
          </div>
        )}
      </div>

      {imagenActiva && (
        <ImageLightbox nombreArchivo={imagenActiva} onClose={() => setImagenActiva(null)} />
      )}
    </div>
  )
}