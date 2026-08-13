import { useEffect, useMemo, useRef, useState } from 'react'
import caseyQuestionImage from '../assets/casey_preg.png'

export default function ManualSidebar({ chapters, loading, error, selectedId, resetSignal, onSelect, onCollapse }) {
  const [openChapters, setOpenChapters] = useState(new Set())
  const [query, setQuery] = useState('')
  const itemRefs = useRef({})

  useEffect(() => {
    setQuery('')
  }, [resetSignal])

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
      if (prev.size === 1 && prev.has(item.chapter.id)) return prev
      return new Set([item.chapter.id])
    })
  }, [selectedId, flatSections])

  function toggleChapter(id) {
    setOpenChapters((prev) => {
      if (prev.has(id)) {
        return new Set()
      }
      return new Set([id])
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
    <nav className="flex h-full w-full flex-col overflow-hidden bg-white">
      <div className="relative z-10 shrink-0 border-b border-line bg-white px-5 py-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-blue-100 bg-blue-50 shadow-sm">
              <img src={caseyQuestionImage} alt="Casey" className="h-full w-full object-cover" />
            </div>
            <h2 className="font-display text-base font-bold leading-snug text-blue-950">¿Qué necesitas encontrar?</h2>
          </div>
          <div className="group relative shrink-0">
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Colapsar menú del manual"
              className="grid h-9 w-9 place-items-center rounded-lg text-xl text-slate transition hover:bg-brand-blue/5 hover:text-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            >
              «
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-20 mt-1 whitespace-nowrap rounded-md bg-blue-950 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              Colapsar menú
            </span>
          </div>
        </div>

        <div className="relative mt-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el manual..."
            className="w-full rounded-xl border border-blue-100 py-3 pl-4 pr-11 text-sm shadow-sm outline-none transition focus:border-brand-blue focus:ring-[3px] focus:ring-brand-blue/15"
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
                    title={`${item.subchapter.title} — ${item.chapter.title}`}
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <h3 className="mb-3 px-1 font-display text-sm font-bold uppercase tracking-wide text-blue-950">Índice del manual</h3>
      <ul className="space-y-1">
        {chapters.map((chapter) => {
          const isOpen = openChapters.has(chapter.id)
          return (
            <li key={chapter.id}>
              <button
                type="button"
                onClick={() => toggleChapter(chapter.id)}
                aria-expanded={isOpen}
                className={`flex w-full items-center gap-3 rounded-xl border-l-2 px-3 py-3 text-left text-sm transition cursor-pointer ${
                  isOpen
                    ? 'border-brand-blue bg-gradient-to-r from-blue-50 to-slate-50 text-brand-blue shadow-sm'
                    : 'border-transparent text-blue-950 hover:bg-brand-blue/5'
                }`}
              >
                <svg className={`h-5 w-5 shrink-0 ${isOpen ? 'text-brand-blue' : 'text-slate'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" />
                </svg>
                <span className={`min-w-0 flex-1 leading-snug ${isOpen ? 'font-semibold' : 'font-medium'}`}>{chapter.title}</span>
                <span className={`text-xl transition-transform ${isOpen ? 'rotate-90 text-brand-blue' : 'text-slate'}`}>{'\u203A'}</span>
              </button>

              {isOpen && (
                <ul className="ml-6 border-l border-blue-100 pb-2 pl-3 pt-1">
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
      </div>

      <div className="z-10 flex h-[73px] shrink-0 items-center justify-between gap-2 border-t border-line bg-white px-4 shadow-[0_-4px_10px_-6px_rgba(15,23,42,0.08)]">
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
