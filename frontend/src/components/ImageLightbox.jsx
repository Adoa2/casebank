import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'
import { authHeaders } from '../api/authToken'

const ZOOM_MIN = 1
const ZOOM_MAX = 3
const ZOOM_STEP = 0.5

export default function ImageLightbox({ nombreArchivo, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let cancelado = false
    let urlActual = null

    async function cargarImagen() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/manual/imagenes/${nombreArchivo}`, {
          headers: authHeaders(),
        })
        if (!res.ok) throw new Error('No se pudo cargar la imagen.')

        const blob = await res.blob()
        urlActual = URL.createObjectURL(blob)

        if (!cancelado) {
          setBlobUrl(urlActual)
        } else {
          URL.revokeObjectURL(urlActual)
        }
      } catch {
        if (!cancelado) setError(true)
      }
    }

    cargarImagen()

    return () => {
      cancelado = true
      if (urlActual) URL.revokeObjectURL(urlActual)
    }
  }, [nombreArchivo])

  useEffect(() => {
    function manejarTecla(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', manejarTecla)
    return () => window.removeEventListener('keydown', manejarTecla)
  }, [onClose])

  const acercar = () => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))
  const alejar = () => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-line">
          <div className="flex items-center gap-2">
            <button
              onClick={alejar}
              disabled={zoom <= ZOOM_MIN}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-line text-slate hover:bg-paper disabled:opacity-40"
              aria-label="Disminuir tamaño"
            >
              −
            </button>
            <span className="text-xs text-slate w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={acercar}
              disabled={zoom >= ZOOM_MAX}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-line text-slate hover:bg-paper disabled:opacity-40"
              aria-label="Aumentar tamaño"
            >
              +
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate hover:bg-brand-red-50 hover:text-brand-red-600"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-paper flex items-center justify-center p-4">
          {error && <p className="text-sm text-slate">No se pudo cargar la imagen.</p>}
          {!error && !blobUrl && <p className="text-sm text-slate">Cargando imagen...</p>}
          {blobUrl && (
            <img
              src={blobUrl}
              alt={nombreArchivo}
              style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease' }}
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  )
}