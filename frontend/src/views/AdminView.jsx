import { useState } from 'react'
import Header from '../components/Header'
import AdminSidebar from '../components/AdminSidebar'
import UsersSection from '../components/UsersSection'
import ErrorsSection from '../components/ErrorsSection'

export default function AdminView({ onLogout, onGoDashboard }) {
  const [activeSection, setActiveSection] = useState('usuarios')

  return (
    <div className="h-screen flex flex-col">
      <Header onLogout={onLogout} onGoHome={onGoDashboard} showSupport={false} />

      <div className="flex-1 flex min-h-0 bg-white">
        <AdminSidebar activeSection={activeSection} onSelectSection={setActiveSection} />

        <div className="flex-1 min-h-0 overflow-y-auto p-8">
          {activeSection === 'usuarios' && <UsersSection />}
          {activeSection === 'errores-frecuentes' && <ErrorsSection />}
        </div>
      </div>
    </div>
  )
}