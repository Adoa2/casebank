import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function esYoutube(url) {
  return /youtu\.?be/i.test(url)
}

function obtenerUrlReproducible(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('dropbox.com')) {
      u.hostname = 'dl.dropboxusercontent.com'
      u.searchParams.delete('dl')
      return u.toString()
    }
    return url
  } catch {
    return url
  }
}

export default function VideoGalleryModal({ videos, onClose }) {
  const [activo, setActivo] = useState(null)

  useEffect(() => {
    const overflowOriginal = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflowOriginal
    }
  }, [])

  const contenido = activo ? (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-950">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b-4 border-slate-300 bg-white px-4 py-3 shadow-lg">
        <h3 className="truncate pr-4 text-base font-semibold text-slate-900">{activo.titulo}</h3>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setActivo(null)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 transition-all duration-150 hover:scale-105 hover:bg-slate-100 hover:text-brand-blue active:scale-95"
          >
            ‹ Volver
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 transition-all duration-150 hover:scale-105 hover:bg-red-50 hover:text-red-600 active:scale-95"
          >
            Cerrar ✕
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden bg-black">
        {esYoutube(activo.url) ? (
          <iframe
            src={obtenerEmbedYoutube(activo.url)}
            title={activo.titulo}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <video src={obtenerUrlReproducible(activo.url)} controls autoPlay className="h-full w-full bg-black object-contain" />
        )}
      </div>
    </div>
  ) : (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Videos formativos</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {videos.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No hay videos disponibles para esta sección.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {videos.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setActivo(v)}
                className="group flex flex-col items-center gap-2 rounded-xl border border-line bg-paper p-3 text-center transition hover:border-brand-blue/40 hover:shadow-md"
              >
                <div className="flex h-20 w-full items-center justify-center rounded-lg bg-blue-950 text-white transition group-hover:bg-brand-blue">
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7Z" />
                  </svg>
                </div>
                <span className="line-clamp-2 text-sm font-medium text-ink">{v.titulo}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(contenido, document.body)
}