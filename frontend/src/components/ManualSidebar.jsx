import { useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from '../config'
import { authHeaders } from '../api/authToken'
import { buildManualTree } from '../utils/manualTree'

export default function ManualSidebar({ selectedId, onSelect }) {
  const [chapters, setChapters] = useState([])
  const [openChapters, setOpenChapters] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelado = false

    async function cargarManual() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/manual`, {
          headers: authHeaders(),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.detail || 'No se pudo cargar el índice del manual.')
        }

        const secciones = await res.json()
        const tree = buildManualTree(secciones)

        if (!cancelado) {
          setChapters(tree)
          setOpenChapters(new Set([tree[0]?.id]))
        }
      } catch (err) {
        if (!cancelado) setError(err.message)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }

    cargarManual()
    return () => {
      cancelado = true
    }
  }, [])

  // Lista plana de todas las subsecciones, en el mismo orden del manual,
  // conservando referencia a su capitulo. Sirve tanto para el buscador
  // como para calcular la seccion anterior/siguiente.
  const flatSections = useMemo(() => {
    const flat = []
    for (const chapter of chapters) {
      for (const sub of chapter.subchapters) {
        flat.push({ chapter, subchapter: sub })
      }
    }
    return flat
  }, [chapters])

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    return flatSections
      .filter(
        ({ subchapter }) =>
          subchapter.title?.toLowerCase().includes(q) || subchapter.contenido?.toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [query, flatSections])

  const currentIndex = useMemo(
    () => flatSections.findIndex(({ subchapter }) => subchapter.id === selectedId),
    [flatSections, selectedId]
  )

  function toggleChapter(id) {
    setOpenChapters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function goToIndex(index) {
    const item = flatSections[index]
    if (!item) return
    onSelect(item.subchapter, item.chapter)
    setOpenChapters((prev) => new Set(prev).add(item.chapter.id))
  }

  function handleSearchSelect(item) {
    onSelect(item.subchapter, item.chapter)
    setOpenChapters((prev) => new Set(prev).add(item.chapter.id))
    setQuery('')
  }

  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex !== -1 && currentIndex < flatSections.length - 1

  if (loading) {
    return (
      <nav className="w-full h-full overflow-y-auto bg-white px-4 py-4">
        <p className="text-sm text-slate">Cargando índice del manual...</p>
      </nav>
    )
  }

  if (error) {
    return (
      <nav className="w-full h-full overflow-y-auto bg-white px-4 py-4">
        <p className="text-sm text-red-600">{error}</p>
      </nav>
    )
  }

  return (
    <nav className="w-full h-full overflow-y-auto bg-white">
      {/* Contenedor fijo: header + buscador + flechas de navegacion.
          Al quedar sticky en la parte superior, nunca lo tapa la lista
          del indice al desplegarse hacia abajo. */}
      <div className="sticky top-0 z-10 bg-white px-4 py-4 border-b border-line">
        <h2 className="font-display text-sm font-semibold text-slate uppercase tracking-wide">Índice del manual</h2>

        <div className="relative mt-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el manual..."
            className="w-full text-sm rounded-lg border border-line px-3 py-2 outline-none focus:border-brand-blue transition"
          />

          {query.trim() && (
            <div className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-white shadow-lg z-20">
              {searchResults.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-slate">Sin resultados.</p>
              ) : (
                searchResults.map((item) => (
                  <button
                    key={item.subchapter.id}
                    type="button"
                    onClick={() => handleSearchSelect(item)}
                    className="w-full text-left px-3 py-2 hover:bg-brand-blue/5 transition border-b border-line last:border-b-0 cursor-pointer"
                  >
                    <p className="text-sm text-ink font-medium truncate">{item.subchapter.title}</p>
                    <p className="text-xs text-slate truncate">{item.chapter.title}</p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <ul className="py-2">
        {chapters.map((chapter) => {
          const isOpen = openChapters.has(chapter.id)
          return (
            <li key={chapter.id} className="px-2">
              <button
                type="button"
                onClick={() => toggleChapter(chapter.id)}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-sm font-medium text-ink hover:bg-brand-blue/5 transition cursor-pointer"
              >
                <span>{chapter.title}</span>
                <span className={`text-slate transition-transform ${isOpen ? 'rotate-90' : ''}`}>{'\u203A'}</span>
              </button>

              {isOpen && (
                <ul className="pl-3 pb-1">
                  {chapter.subchapters.map((sub) => {
                    const active = sub.id === selectedId
                    // nivel 2 = sin indentacion extra, nivel 3/4 se indentan mas
                    const indent = Math.max(0, (sub.nivel || 2) - 2)
                    return (
                      <li key={sub.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(sub, chapter)}
                          style={{ paddingLeft: `${10 + indent * 14}px` }}
                          className={`w-full text-left py-1.5 pr-2.5 rounded-lg text-sm transition cursor-pointer ${
                            active
                              ? 'bg-brand-blue/10 text-brand-blue font-medium'
                              : 'text-slate hover:bg-brand-blue/5 hover:text-ink'
                          }`}
                        >
                          {sub.title}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      {/* Contenedor fijo al pie del sidebar. Al ser sticky bottom-0, la
          lista del indice puede desplegarse hacia abajo sin taparlo. */}
      <div className="sticky bottom-0 z-10 bg-white border-t border-line px-4 py-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goToIndex(currentIndex - 1)}
          disabled={!canGoPrev}
          className="text-sm px-2 py-1 rounded-md text-slate hover:bg-brand-blue/5 hover:text-ink transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
        >
          {'\u2039'} Anterior
        </button>

        <span className="text-xs text-slate">
          {currentIndex !== -1 ? `${currentIndex + 1} / ${flatSections.length}` : '—'}
        </span>

        <button
          type="button"
          onClick={() => goToIndex(currentIndex === -1 ? 0 : currentIndex + 1)}
          disabled={!canGoNext}
          className="text-sm px-2 py-1 rounded-md text-slate hover:bg-brand-blue/5 hover:text-ink transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
        >
          Siguiente {'\u203A'}
        </button>
      </div>
    </nav>
  )
}