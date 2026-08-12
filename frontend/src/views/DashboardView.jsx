import { useEffect, useMemo, useState } from 'react'
import Header from '../components/Header'
import PageToolbar from '../components/PageToolbar'
import ManualSidebar from '../components/ManualSidebar'
import ManualContent from '../components/ManualContent'
import ChatPanel from '../components/ChatPanel'
import { API_BASE_URL } from '../config'
import { authHeaders } from '../api/authToken'
import { buildManualTree } from '../utils/manualTree'
import AuthImage from '../components/AuthImage'

export default function DashboardView({ onLogout }) {
  const [selected, setSelected] = useState({ chapter: null, subchapter: null })
  const [chapters, setChapters] = useState([])
  const [manualLoading, setManualLoading] = useState(true)
  const [manualError, setManualError] = useState(null)

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

  function goHome() {
    setSelected({ chapter: null, subchapter: null })
  }

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

      <div className="flex-1 flex min-h-0">
        <div className="hidden md:block w-[280px] flex-shrink-0 border-r border-line min-h-0">
          <ManualSidebar
            chapters={chapters}
            loading={manualLoading}
            error={manualError}
            selectedId={selected.subchapter?.id}
            onSelect={handleSelect}
          />
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <PageToolbar onGoHome={goHome} />
          <ManualContent chapter={selected.chapter} subchapter={selected.subchapter} />
        </div>

        <div className="hidden xl:block w-[340px] flex-shrink-0 border-l border-line min-h-0">
          <ChatPanel onSelectSource={handleSelectSource} />
        </div>
      </div>
    </div>
  )}