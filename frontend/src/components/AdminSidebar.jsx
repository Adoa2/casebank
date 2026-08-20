import logo from '../assets/logo.png'

const NAV_ITEMS = [
  { id: 'inicio', label: 'Inicio', minRole: 1, icon: 'home' },
  { id: 'usuarios', label: 'Usuarios', minRole: 2, icon: 'users' },
  { id: 'videos', label: 'Administrar Videos', minRole: 2, icon: 'video' },
  { id: 'actualizaciones', label: 'Actualizaciones PDF', minRole: 2, icon: 'document' },
  { id: 'errores-frecuentes', label: 'Errores Frecuentes', minRole: 1, icon: 'warning' },
]

function NavIcon({ name }) {
  if (name === 'home') {
    return <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>
  }
  if (name === 'users') {
    return (
      <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="7" r="3.2" />
        <path d="M5.5 21v-2.2c0-3.3 2.5-5.8 6.5-5.8s6.5 2.5 6.5 5.8V21" />
      </svg>
    )
  }
  if (name === 'video') {
    return (
      <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m10 9 5 3-5 3Z" />
      </svg>
    )
  }
  if (name === 'document') {
    return <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 12h6m-6 4h6" /></svg>
  }
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10.3 3.8 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 16.5h.01" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export default function AdminSidebar({ activeSection, onSelectSection, role = 0 }) {
  return (
    <aside className="admin-sidebar flex w-full shrink-0 flex-col border-b border-white/10 px-3 py-3 text-white lg:h-full lg:w-[270px] lg:border-b-0 lg:px-4 lg:py-0 xl:w-[300px]">
      <div className="flex h-14 items-center px-2 lg:h-20 lg:px-3">
        <img src={logo} alt="CaseBank" className="h-10 w-auto max-w-[170px] object-contain object-left" />
      </div>

      <span className="hidden px-3 pb-4 pt-7 text-xs font-semibold uppercase tracking-wide text-blue-200/70 lg:block">
        Panel administrativo
      </span>

      <nav aria-label="Panel administrativo">
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
          {NAV_ITEMS.filter((item) => item.id !== 'actualizaciones' || role >= 2).map((item) => {
            const active = item.id === activeSection
            const locked = role < item.minRole
            return (
              <li key={item.id} className="shrink-0 lg:block">
                <button
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  disabled={locked}
                  title={locked ? 'Requiere privilegio mayor' : undefined}
                  className={`group relative flex w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 py-3 text-left text-sm transition-all lg:min-h-[58px] lg:px-4 ${
                    locked
                      ? 'cursor-not-allowed text-blue-400/50'
                      : active
                        ? 'bg-white/10 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.03)]'
                        : 'text-blue-100/90 hover:bg-white/[.06] hover:text-white'
                  }`}
                >
                  {active && !locked && (
                    <span className="absolute -left-3 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-[#168bff] lg:-left-4" />
                  )}
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                  {locked && <span className="ml-auto"><LockIcon /></span>}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

    </aside>
  )
}
