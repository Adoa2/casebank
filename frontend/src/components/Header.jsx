import logo from '../assets/logo.png'

export default function Header({ onLogout, onGoHome }) {
  function handleLogoutClick(e) {
    // Evita que el clic en "Cerrar sesión" tambien dispare onGoHome,
    e.stopPropagation()
    onLogout()
  }

  return (
    <header
      onClick={onGoHome}
      className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-line bg-white cursor-pointer"
    >
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="CaseBank" className="h-12 w-auto" />
        <span className="font-display text-lg font-semibold text-ink">CaseBank</span>
        <span className="text-xs text-slate hidden sm:inline">Manual interactivo</span>
      </div>

      <button
        type="button"
        onClick={handleLogoutClick}
        className="text-sm text-slate border border-transparent rounded-md px-3 py-1.5 transition-colors hover:text-brand-red-600 hover:border-brand-red-100 hover:bg-brand-red-50 cursor-pointer"
      >
        Cerrar sesión
      </button>
    </header>
  )
}