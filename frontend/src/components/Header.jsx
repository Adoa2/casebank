export default function Header({ onLogout }) {
  return (
    <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-line bg-white">
      <div className="flex items-center gap-2">
        <span className="font-display text-lg font-semibold text-ink">CaseBank</span>
        <span className="text-xs text-slate hidden sm:inline">Manual interactivo</span>
      </div>

      <button type="button" onClick={onLogout} className="text-sm text-slate hover:text-ink transition">
        Cerrar sesión
      </button>
    </header>
  )
}
