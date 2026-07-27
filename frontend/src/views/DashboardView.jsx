import { useState } from 'react'
import Header from '../components/Header'
import ManualSidebar from '../components/ManualSidebar'
import ManualContent from '../components/ManualContent'
import ChatPanel from '../components/ChatPanel'

export default function DashboardView({ onLogout }) {
  const [selected, setSelected] = useState({ chapter: null, subchapter: null })

  function handleSelect(subchapter, chapter) {
    setSelected({ chapter, subchapter })
  }

  return (
    <div className="h-screen flex flex-col">
      <Header onLogout={onLogout} />

      <div className="flex-1 flex min-h-0">
        <div className="hidden md:block w-[280px] flex-shrink-0 border-r border-line min-h-0">
          <ManualSidebar selectedId={selected.subchapter?.id} onSelect={handleSelect} />
        </div>

        <ManualContent chapter={selected.chapter} subchapter={selected.subchapter} />

        <div className="hidden xl:block w-[340px] flex-shrink-0 border-l border-line min-h-0">
          <ChatPanel />
        </div>
      </div>
    </div>
  )
}
