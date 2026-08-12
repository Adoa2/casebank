const NAV_ITEMS = [
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'errores-frecuentes', label: 'Errores Frecuentes' },
]

export default function AdminSidebar({ activeSection, onSelectSection }) {
  return (
    <nav className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-line bg-blue-950 py-4">
      <span className="px-5 pb-3 text-xs font-semibold uppercase tracking-wide text-blue-300">
        Panel administrativo
      </span>

      <ul className="flex-1 space-y-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeSection
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'bg-white/10 font-medium text-white'
                    : 'text-blue-200 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}