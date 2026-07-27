import { useState } from 'react'
import { mockManualChapters } from '../data/mockManual'

export default function ManualSidebar({ selectedId, onSelect }) {
  const [openChapters, setOpenChapters] = useState(() => new Set([mockManualChapters[0]?.id]))

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

  return (
    <nav className="w-full h-full overflow-y-auto bg-white">
      <div className="px-4 py-4 border-b border-line">
        <h2 className="font-display text-sm font-semibold text-slate uppercase tracking-wide">Índice del manual</h2>
      </div>

      <ul className="py-2">
        {mockManualChapters.map((chapter) => {
          const isOpen = openChapters.has(chapter.id)
          return (
            <li key={chapter.id} className="px-2">
              <button
                type="button"
                onClick={() => toggleChapter(chapter.id)}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-sm font-medium text-ink hover:bg-paper transition"
              >
                <span>{chapter.title}</span>
                <span className={`text-slate transition-transform ${isOpen ? 'rotate-90' : ''}`}>{'\u203A'}</span>
              </button>

              {isOpen && (
                <ul className="pl-3 pb-1">
                  {chapter.subchapters.map((sub) => {
                    const active = sub.id === selectedId
                    return (
                      <li key={sub.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(sub, chapter)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition ${
                            active
                              ? 'bg-brand-blue/10 text-brand-blue font-medium'
                              : 'text-slate hover:bg-paper hover:text-ink'
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
