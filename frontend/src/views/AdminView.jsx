import { useState } from 'react'
import Header from '../components/Header'
import AdminSidebar from '../components/AdminSidebar'
import UsersSection from '../components/UsersSection'
import ErrorsSection from '../components/ErrorsSection'
import VideosSection from '../components/VideosSection'
import AdminHome from '../components/AdminHome'
import UpdatesSection from '../components/UpdatesSection'

export default function AdminView({ onLogout, onGoDashboard, role = 0 }) {
  const [activeSection, setActiveSection] = useState('inicio')
  const [isViewingDetail, setIsViewingDetail] = useState(false)

  function handleSelectSection(id) {
    if ((id === 'usuarios' || id === 'videos' || id === 'actualizaciones') && role < 2) return
    setIsViewingDetail(false)
    setActiveSection(id)
  }

  return (
    <div className="flex min-h-screen min-h-dvh flex-col bg-[#f7f9fc] lg:h-screen lg:flex-row lg:overflow-hidden">
      <AdminSidebar activeSection={activeSection} onSelectSection={handleSelectSection} role={role} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header onLogout={onLogout} onGoHome={onGoDashboard} showSupport={false} showLogo={false} adminShell />

        <main className="admin-content-bg min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[1580px] flex-col px-4 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
            {activeSection !== 'inicio' && !isViewingDetail && <button
              type="button"
              onClick={() => setActiveSection('inicio')}
              className="group mb-6 inline-flex h-11 w-fit items-center gap-3 rounded-xl border border-blue-100 bg-white px-3.5 pr-4 text-sm font-semibold text-[#0866df] shadow-[0_4px_14px_rgba(30,94,180,.08)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-[0_7px_18px_rgba(30,94,180,.13)] focus:outline-none focus:ring-4 focus:ring-blue-100 active:translate-y-0 lg:mb-7"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </span>
              <span>Volver al inicio</span>
            </button>}

            {activeSection === 'inicio' && <AdminHome role={role} onNavigate={handleSelectSection} onGoManual={onGoDashboard} />}
            {activeSection === 'usuarios' && role >= 2 && <UsersSection />}
            {activeSection === 'errores-frecuentes' && role >= 1 && <ErrorsSection onDetailChange={setIsViewingDetail} />}
            {activeSection === 'videos' && role >= 2 && <VideosSection />}
            {activeSection === 'actualizaciones' && role >= 2 && <UpdatesSection />}

            <footer className="mt-auto pt-8 text-center text-xs text-slate-500 sm:text-sm">
              © 2026 CaseBank. Todos los derechos reservados.
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
