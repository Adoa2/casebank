import logo from '../assets/logo.png'

export default function Header({ onLogout, onGoHome }) {
  function handleLogoutClick(e) {
    // Evita que el clic en "Cerrar sesión" tambien dispare onGoHome
    e.stopPropagation()
    onLogout()
  }

  return (
    <header
      onClick={onGoHome}
      className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-white/10 bg-[#393d42] cursor-pointer"
    >
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="CaseBank" className="h-12 w-auto" />
        <span className="font-display text-lg font-semibold text-white">CaseBank</span>
        <span className="text-xs text-white/70 hidden sm:inline">Manual interactivo</span>
      </div>

      <button
        type="button"
        onClick={handleLogoutClick}
        className="text-sm text-white/90 border border-transparent rounded-md px-3 py-1.5 transition-colors hover:text-white hover:border-brand-red-600 hover:bg-brand-red-600 cursor-pointer"
      >
        Cerrar sesión
      </button>
    </header>
  )
}