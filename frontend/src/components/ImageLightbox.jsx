import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL } from '../config'
import { authHeaders } from '../api/authToken'

const ZOOM_MIN = 1
const ZOOM_MAX = 3
const ZOOM_STEP = 0.5

export default function ImageLightbox({ nombreArchivo, imageUrl, onClose }) {
  const [blobUrl, setBlobUrl] = useState(imageUrl || null)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const [arrastrando, setArrastrando] = useState(false)
  const inicioMouseRef = useRef({ x: 0, y: 0 })
  const inicioPosRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    setZoom(1)
    setPos({ x: 0, y: 0 })
    setError(false)

    if (imageUrl) {
      setBlobUrl(imageUrl)
      return
    }

    if (!nombreArchivo) return

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
  }, [nombreArchivo, imageUrl])

  useEffect(() => {
    function manejarTecla(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', manejarTecla)
    return () => window.removeEventListener('keydown', manejarTecla)
  }, [onClose])

  const acercar = () =>
    setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))

  const alejar = () =>
    setZoom((z) => {
      const nuevo = Math.max(ZOOM_MIN, z - ZOOM_STEP)
      if (nuevo === ZOOM_MIN) setPos({ x: 0, y: 0 })
      return nuevo
    })

  const manejarMouseDown = (e) => {
    if (zoom <= ZOOM_MIN) return
    e.preventDefault()
    setArrastrando(true)
    inicioMouseRef.current = { x: e.clientX, y: e.clientY }
    inicioPosRef.current = { ...pos }
  }

  const manejarMouseMove = (e) => {
    if (!arrastrando) return
    const dx = e.clientX - inicioMouseRef.current.x
    const dy = e.clientY - inicioMouseRef.current.y
    setPos({ x: inicioPosRef.current.x + dx, y: inicioPosRef.current.y + dy })
  }

  const terminarArrastre = () => {
    setArrastrando(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
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

        <div
          className="flex min-h-0 flex-1 aspect-square items-center justify-center overflow-hidden bg-paper p-2 select-none sm:p-4"
          style={{ cursor: zoom > ZOOM_MIN ? (arrastrando ? 'grabbing' : 'grab') : 'default' }}
          onMouseDown={manejarMouseDown}
          onMouseMove={manejarMouseMove}
          onMouseUp={terminarArrastre}
          onMouseLeave={terminarArrastre}
        >
          {error && <p className="text-sm text-slate">No se pudo cargar la imagen.</p>}
          {!error && !blobUrl && <p className="text-sm text-slate">Cargando imagen...</p>}
          {blobUrl && (
            <img
              src={blobUrl}
              alt={nombreArchivo || 'Imagen de evidencia'}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
                transition: arrastrando ? 'none' : 'transform 0.15s ease',
              }}
              className="max-w-full max-h-full object-contain pointer-events-none"
            />
          )}
        </div>
      </div>
    </div>
  )
}