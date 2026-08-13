import { useState } from 'react'
import Header from '../components/Header'
import AdminSidebar from '../components/AdminSidebar'
import UsersSection from '../components/UsersSection'
import ErrorsSection from '../components/ErrorsSection'

export default function AdminView({ onLogout, onGoDashboard }) {
  const [activeSection, setActiveSection] = useState('usuarios')

  return (
    <div className="flex h-screen h-dvh flex-col">
      <Header onLogout={onLogout} showSupport={false} />

      <div className="flex min-h-0 flex-1 flex-col bg-white md:flex-row">
        <AdminSidebar activeSection={activeSection} onSelectSection={setActiveSection} />

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <button
            type="button"
            onClick={onGoDashboard}
            className="mb-4 flex items-center gap-2 text-sm font-medium text-brand-blue hover:underline"
          >
            <span aria-hidden="true">‹</span> Volver al manual
          </button>
          {activeSection === 'usuarios' && <UsersSection />}
          {activeSection === 'errores-frecuentes' && <ErrorsSection />}
        </div>
      </div>
    </div>
  )
}
