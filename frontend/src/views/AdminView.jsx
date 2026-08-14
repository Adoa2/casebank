import { useState } from 'react'
import Header from '../components/Header'
import AdminSidebar from '../components/AdminSidebar'
import UsersSection from '../components/UsersSection'
import ErrorsSection from '../components/ErrorsSection'
import VideosSection from '../components/VideosSection'

export default function AdminView({ onLogout, onGoDashboard, role = 0 }) {
  const [activeSection, setActiveSection] = useState('errores-frecuentes')

  function handleSelectSection(id) {
    if ((id === 'usuarios' || id === 'videos') && role < 2) return
    setActiveSection(id)
  }

  return (
    <div className="flex h-screen h-dvh flex-col">
      <Header onLogout={onLogout} onGoHome={onGoDashboard} showSupport={false} />

      <div className="flex min-h-0 flex-1 flex-col bg-white md:flex-row">
        <AdminSidebar activeSection={activeSection} onSelectSection={handleSelectSection} role={role} />

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <button
            type="button"
            onClick={onGoDashboard}
            className="mb-4 flex items-center gap-2 text-sm font-medium text-brand-blue hover:underline"
          >
            <span aria-hidden="true">‹</span> Volver al manual
          </button>
          {activeSection === 'usuarios' && role >= 2 && <UsersSection />}
          {activeSection === 'errores-frecuentes' && <ErrorsSection />}
          {activeSection === 'videos' && role >= 2 && <VideosSection />}
        </div>
      </div>
    </div>
  )
}