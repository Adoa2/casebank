import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'
import { authHeaders } from '../api/authToken'
import { buildManualTree } from '../utils/manualTree'

export default function ManualSidebar({ selectedId, onSelect }) {
  const [chapters, setChapters] = useState([])
  const [openChapters, setOpenChapters] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
      <div className="px-4 py-4 border-b border-line">
        <h2 className="font-display text-sm font-semibold text-slate uppercase tracking-wide">Índice del manual</h2>
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
    </nav>
  )
}