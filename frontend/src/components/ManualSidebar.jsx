import { useEffect, useMemo, useRef, useState } from 'react'

export default function ManualSidebar({ chapters, loading, error, selectedId, resetSignal, onSelect }) {
  const [openChapters, setOpenChapters] = useState(new Set())
  const [query, setQuery] = useState('')
  const itemRefs = useRef({})

  useEffect(() => {
    setQuery('')
  }, [resetSignal])

  // Al llegar el primer manual cargado, abre el primer capitulo por defecto.
  useEffect(() => {
    if (chapters.length > 0 && openChapters.size === 0) {
      setOpenChapters(new Set([chapters[0].id]))
    }
  }, [chapters])

  // Lista plana de todas las subsecciones, en el mismo orden del manual,
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

  useEffect(() => {
    if (!selectedId) return
    const item = flatSections.find(({ subchapter }) => subchapter.id === selectedId)
    if (!item) return

    setOpenChapters((prev) => {
      if (prev.has(item.chapter.id)) return prev
      const next = new Set(prev)
      next.add(item.chapter.id)
      return next
    })
  }, [selectedId, flatSections])

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
  }

  function handleSearchSelect(item) {
    onSelect(item.subchapter, item.chapter)
    setQuery('')
  }

  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex !== -1 && currentIndex < flatSections.length - 1

  // Cada vez que cambia la seccion seleccionada (clic manual, buscador,
  useEffect(() => {
    const el = itemRefs.current[selectedId]
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [selectedId, openChapters])

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
      {/* Contenedor fijo: header + buscador. Al quedar sticky en la parte
          superior, nunca lo tapa la lista del indice al desplegarse hacia
          abajo. */}
      <div className="sticky top-0 z-10 bg-white px-5 py-5 border-b border-line">
        <h2 className="font-display text-sm font-semibold text-blue-950 uppercase tracking-wide">Índice del manual</h2>

        <div className="relative mt-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el manual..."
            className="w-full text-sm rounded-lg border border-line py-2.5 pl-3 pr-10 outline-none focus:border-brand-blue focus:ring-[3px] focus:ring-brand-blue/15 transition"
          />
          <svg className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="m16 16 4 4" />
          </svg>

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

      <ul>
        {chapters.map((chapter) => {
          const isOpen = openChapters.has(chapter.id)
          return (
            <li key={chapter.id} className="border-b border-line px-3 py-2">
              <button
                type="button"
                onClick={() => toggleChapter(chapter.id)}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-sm font-semibold text-blue-950 hover:bg-brand-blue/5 transition cursor-pointer"
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
                          ref={(el) => {
                            itemRefs.current[sub.id] = el
                          }}
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

      <div className="sticky bottom-0 z-10 bg-white border-t border-line px-4 py-4 flex items-center justify-between gap-2 shadow-[0_-4px_10px_-6px_rgba(15,23,42,0.08)]">
        <button
          type="button"
          onClick={() => goToIndex(currentIndex - 1)}
          disabled={!canGoPrev}
          className="text-sm px-2.5 py-1.5 rounded-md text-slate hover:bg-brand-blue/5 hover:text-brand-blue transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
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
          className="text-sm px-2.5 py-1.5 rounded-md text-slate hover:bg-brand-blue/5 hover:text-brand-blue transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
        >
          Siguiente {'\u203A'}
        </button>
      </div>
    </nav>
  )
}