import { useState } from 'react'
import Header from '../components/Header'
import AdminSidebar from '../components/AdminSidebar'

const SECTION_LABELS = {
  dashboard: 'Dashboard',
  usuarios: 'Usuarios',
  roles: 'Roles',
  manual: 'Manual',
  'base-conocimiento': 'Base de Conocimiento',
  'errores-frecuentes': 'Errores Frecuentes',
  'historial-consultas': 'Historial de Consultas',
  configuraciones: 'Configuraciones',
  bitacora: 'Bitácora',
  perfil: 'Perfil',
}

export default function AdminView({ onLogout, onGoDashboard }) {
  const [activeSection, setActiveSection] = useState('dashboard')

  return (
    <div className="h-screen flex flex-col">
      <Header onLogout={onLogout} onGoHome={onGoDashboard} />

      <div className="flex-1 flex min-h-0 bg-white">
        <AdminSidebar activeSection={activeSection} onSelectSection={setActiveSection} />

        <div className="flex-1 min-h-0 overflow-y-auto p-8">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">
            {SECTION_LABELS[activeSection]}
          </h1>
          <p className="mb-6 text-sm text-slate">
            Panel administrativo de CaseBank.
          </p>

          <div className="rounded-xl border border-dashed border-line bg-blue-50/40 p-10 text-center text-sm text-slate">
            Esta sección se implementará en una próxima sesión.
          </div>
        </div>
      </div>
    </div>
  )
}