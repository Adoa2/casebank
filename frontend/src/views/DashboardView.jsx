import { useEffect, useMemo, useState } from 'react'
import Header from '../components/Header'
import ManualSidebar from '../components/ManualSidebar'
import ManualContent from '../components/ManualContent'
import ChatPanel from '../components/ChatPanel'
import TipsCarousel from '../components/TipsCarousel'
import caseyChatImage from '../assets/casey_chat.png'
import caseyReadingImage from '../assets/casey_lee.png'
import { fetchManualStructure } from '../api/manual'
import { buildManualTree } from '../utils/manualTree'

export default function DashboardView({ onLogout, isAdmin, onGoAdmin }) {
  const [selected, setSelected] = useState({ chapter: null, subchapter: null })
  const [chapters, setChapters] = useState([])
  const [manualLoading, setManualLoading] = useState(true)
  const [manualError, setManualError] = useState(null)
  const [homeResetSignal, setHomeResetSignal] = useState(0)
  const [manualCollapsed, setManualCollapsed] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [mobilePanel, setMobilePanel] = useState(null)

  useEffect(() => {
    let cancelado = false

    async function cargarManual() {
      try {
        const secciones = await fetchManualStructure()
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

  function handleMobileSelect(subchapter, chapter) {
    handleSelect(subchapter, chapter)
    setMobilePanel(null)
  }

  function goHome() {
    setSelected({ chapter: null, subchapter: null })
    setHomeResetSignal((current) => current + 1)
  }

  function handleSelectSource(seccionId) {
    const targetId = `sec-${seccionId}`
    const item = flatSections.find(({ subchapter }) => subchapter.id === targetId)
    if (item) {
      handleSelect(item.subchapter, item.chapter)
      setMobilePanel(null)
    }
  }

  return (
    <div className="flex h-screen h-dvh flex-col">
      <Header onLogout={onLogout} isAdmin={isAdmin} onGoAdmin={onGoAdmin} />

      <div className="flex-1 flex min-h-0 bg-white">
        <div
          className={`hidden min-h-0 flex-shrink-0 border-r border-line transition-[width] duration-300 md:block ${
            manualCollapsed ? 'w-[64px]' : 'w-[360px]'
          }`}
        >
          {manualCollapsed ? (
            <div className="flex h-full items-end justify-center bg-white pb-5">
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => setManualCollapsed(false)}
                  aria-label="Mostrar menú del manual"
                  className="h-14 w-14 overflow-hidden rounded-full border-2 border-brand-blue bg-blue-50 shadow-lg transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-[4px] focus:ring-brand-blue/20"
                >
                  <img src={caseyReadingImage} alt="Casey leyendo el manual" className="h-full w-full object-cover" />
                </button>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 whitespace-nowrap rounded-md bg-blue-950 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  Mostrar menú del manual
                </span>
              </div>
            </div>
          ) : (
            <ManualSidebar
              chapters={chapters}
              loading={manualLoading}
              error={manualError}
              selectedId={selected.subchapter?.id}
              resetSignal={homeResetSignal}
              onSelect={handleSelect}
              onCollapse={() => setManualCollapsed(true)}
            />
          )}
        </div>

        <ManualContent chapter={selected.chapter} subchapter={selected.subchapter} onGoHome={goHome} />

        <div
          className={`hidden min-h-0 flex-shrink-0 border-l border-line transition-[width] duration-300 xl:block ${
            chatCollapsed ? 'w-[76px]' : 'w-[360px]'
          }`}
        >
          {chatCollapsed ? (
            <div className="flex h-full items-end justify-center bg-white pb-5">
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => setChatCollapsed(false)}
                  aria-label="Abrir chat con Casey"
                  className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-brand-blue bg-blue-950 shadow-lg transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-[4px] focus:ring-brand-blue/20"
                >
                  <img src={caseyChatImage} alt="Casey en el chat" className="h-full w-full object-cover" />
                  <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />
                </button>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md bg-blue-950 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  Abrir chat con Casey
                </span>
              </div>
            </div>
          ) : (
            <ChatPanel onSelectSource={handleSelectSource} onCollapse={() => setChatCollapsed(true)} />
          )}
        </div>
      </div>

      <div className="flex shrink-0 border-t border-blue-100 bg-white p-2 shadow-[0_-5px_16px_-10px_rgba(15,23,42,0.35)] xl:hidden">
        <button
          type="button"
          onClick={() => setMobilePanel('manual')}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-brand-blue transition hover:bg-blue-50 md:hidden"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" />
          </svg>
          Índice del manual
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel('chat')}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-brand-blue transition hover:bg-blue-50"
        >
          <img src={caseyChatImage} alt="" className="h-7 w-7 rounded-full object-cover" />
          Preguntar a Casey
        </button>
      </div>

      {mobilePanel && (
        <div
          className="fixed inset-0 z-50 bg-blue-950/35 backdrop-blur-[1px] xl:hidden"
          role="dialog"
          aria-modal="true"
          onClick={() => setMobilePanel(null)}
        >
          <div
            className={`absolute inset-y-0 flex w-full max-w-[390px] flex-col bg-white shadow-2xl ${
              mobilePanel === 'manual' ? 'left-0' : 'right-0'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {mobilePanel === 'manual' ? (
              <ManualSidebar
                chapters={chapters}
                loading={manualLoading}
                error={manualError}
                selectedId={selected.subchapter?.id}
                resetSignal={homeResetSignal}
                onSelect={handleMobileSelect}
                onCollapse={() => setMobilePanel(null)}
              />
            ) : (
              <ChatPanel onSelectSource={handleSelectSource} onCollapse={() => setMobilePanel(null)} />
            )}
          </div>
        </div>
      )}

      <TipsCarousel />
    </div>
  )
}