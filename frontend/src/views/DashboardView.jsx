import { useEffect, useMemo, useState } from 'react'
import Header from '../components/Header'
import ManualSidebar from '../components/ManualSidebar'
import ManualContent from '../components/ManualContent'
import ChatPanel from '../components/ChatPanel'
import { API_BASE_URL } from '../config'
import { authHeaders } from '../api/authToken'
import { buildManualTree } from '../utils/manualTree'

export default function DashboardView({ onLogout }) {
  const [selected, setSelected] = useState({ chapter: null, subchapter: null })
  const [chapters, setChapters] = useState([])
  const [manualLoading, setManualLoading] = useState(true)
  const [manualError, setManualError] = useState(null)
  const [homeResetSignal, setHomeResetSignal] = useState(0)

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
        }
      } catch (err) {
        if (!cancelado) setManualError(err.message)
      } finally {
        if (!cancelado) setManualLoading(false)
      }
    }

    cargarManual()
    return () => {
      cancelado = true
    }
  }, [])

  // Lista plana de todas las subsecciones, con referencia a su capitulo.
  const flatSections = useMemo(() => {
    const flat = []
    for (const chapter of chapters) {
      for (const sub of chapter.subchapters) {
        flat.push({ chapter, subchapter: sub })
      }
    }
    return flat
  }, [chapters])

  function handleSelect(subchapter, chapter) {
    setSelected({ chapter, subchapter })
  }

  // Vuelve al carrusel de bienvenida. Se llama al hacer clic en el header.
  function goHome() {
    setSelected({ chapter: null, subchapter: null })
    setHomeResetSignal((current) => current + 1)
  }

  // Llamado cuando el usuario hace clic en una fuente citada por el chat.
  function handleSelectSource(seccionId) {
    const targetId = `sec-${seccionId}`
    const item = flatSections.find(({ subchapter }) => subchapter.id === targetId)
    if (item) {
      handleSelect(item.subchapter, item.chapter)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <Header onLogout={onLogout} onGoHome={goHome} />

      <div className="flex-1 flex min-h-0 bg-white">
        <div className="hidden md:block w-[270px] flex-shrink-0 border-r border-line min-h-0">
          <ManualSidebar
            chapters={chapters}
            loading={manualLoading}
            error={manualError}
            selectedId={selected.subchapter?.id}
            resetSignal={homeResetSignal}
            onSelect={handleSelect}
          />
        </div>

        <ManualContent chapter={selected.chapter} subchapter={selected.subchapter} />

        <div className="hidden xl:block w-[360px] flex-shrink-0 border-l border-line min-h-0">
          <ChatPanel onSelectSource={handleSelectSource} />
        </div>
      </div>

      <footer className="hidden min-h-[54px] flex-shrink-0 items-center gap-3 border-t border-blue-100 bg-blue-50/80 px-7 text-sm text-slate md:flex">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-100 text-brand-blue" aria-hidden="true">💡</span>
        <strong className="text-brand-blue">Consejo:</strong>
        <span>Puedes buscar en el índice, leer el manual o preguntarle a Casey. Él está aquí para ayudarte.</span>
      </footer>
    </div>
  )
}