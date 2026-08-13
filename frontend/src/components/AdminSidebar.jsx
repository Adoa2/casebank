const NAV_ITEMS = [
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'errores-frecuentes', label: 'Errores Frecuentes' },
]

export default function AdminSidebar({ activeSection, onSelectSection }) {
  return (
    <nav className="flex h-auto w-full shrink-0 flex-col border-b border-line bg-blue-950 py-2 md:h-full md:w-[240px] md:border-b-0 md:border-r md:py-4">
      <span className="hidden px-5 pb-3 text-xs font-semibold uppercase tracking-wide text-blue-300 md:block">
        Panel administrativo
      </span>

      <ul className="flex flex-1 gap-1 overflow-x-auto px-2 md:block md:space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeSection
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors md:w-full ${
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
