const NAV_ITEMS = [
  { id: 'errores-frecuentes', label: 'Errores Frecuentes', minRole: 1 },
  { id: 'usuarios', label: 'Usuarios', minRole: 2 },
  { id: 'videos', label: 'Administrar Videos', minRole: 2 },
]

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
    <nav className="flex h-auto w-full shrink-0 flex-col border-b border-line bg-blue-950 py-2 md:h-full md:w-[240px] md:border-b-0 md:border-r md:py-4">
      <span className="hidden px-5 pb-3 text-xs font-semibold uppercase tracking-wide text-blue-300 md:block">
        Panel administrativo
      </span>

      <ul className="flex flex-1 gap-1 overflow-x-auto px-2 md:block md:space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeSection
          const locked = role < item.minRole
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelectSection(item.id)}
                disabled={locked}
                title={locked ? 'Requiere privilegio mayor' : undefined}
                className={`flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors md:w-full ${
                  locked
                    ? 'cursor-not-allowed text-blue-400/50'
                    : active
                    ? 'bg-white/10 font-medium text-white'
                    : 'text-blue-200 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {locked && <LockIcon />}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}