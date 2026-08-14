import logo from '../assets/logo.png'

export default function Header({ onLogout, isAdmin = false, onGoAdmin, onGoHome, showSupport = true }) {
  function handleAdminClick(e) {
    e.stopPropagation()
    onGoAdmin()
  }

  function handleHomeClick(e) {
    e.stopPropagation()
    onGoHome()
  }

  function handleLogoutClick(e) {
    e.stopPropagation()
    onLogout()
  }

  return (
    <header className="header-gradient h-16 flex-shrink-0 flex items-center justify-between gap-2 px-3 shadow-sm sm:px-7">
      <img src={logo} alt="CaseBank" className="h-9 w-auto max-w-[145px] object-contain object-left sm:h-11 sm:max-w-none" />

      <div className="flex items-center gap-1 sm:gap-2">
        {onGoHome && (
          <button
            type="button"
            onClick={handleHomeClick}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60 sm:px-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m3 11 9-8 9 8" />
              <path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />
            </svg>
            <span className="hidden sm:inline">Inicio</span>
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={handleAdminClick}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60 sm:px-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 3.5c2.6 1.4 4.4 1.9 6.5 2 .3 4.9-1.3 9.4-6.5 12-5.2-2.6-6.8-7.1-6.5-12 2.1-.1 3.9-.6 6.5-2Z" />
              <path d="m9.5 12 1.8 1.8 3.2-3.6" />
            </svg>
            <span className="hidden sm:inline">Admin</span>
          </button>
        )}

        {showSupport && (
          
          <a
            href="https://soporte.sinteghn.com/clientes/login.php"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60 sm:px-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 9a3.5 3.5 0 1 1 5.7 2.7c-1.3 1-2.2 1.5-2.2 3M12 18h.01" />
            </svg>
            <span className="hidden sm:inline">Soporte</span>
          </a>
        )}

        <button
          type="button"
          onClick={handleLogoutClick}
          className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60 sm:px-3"
        >
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9.5" />
            <circle cx="12" cy="8.5" r="3" />
            <path d="M6.8 18.5c.8-2.8 2.6-4.2 5.2-4.2s4.4 1.4 5.2 4.2" />
          </svg>
          <span className="hidden sm:inline">Cerrar sesión</span>
        </button>
      </div>
    </header>
  )
}