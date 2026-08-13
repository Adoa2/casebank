export default function PageToolbar({ onGoHome }) {
  return (
    <div className="grid grid-cols-2 items-center gap-3 border-b border-line bg-white px-3 py-3 sm:grid-cols-[1fr_auto_1fr] sm:px-6 sm:py-4">
      <div className="justify-self-start">
        <button
          type="button"
          onClick={onGoHome}
          className="text-sm font-medium text-white rounded-md px-3 py-1.5 bg-gradient-to-r from-brand-blue to-sky-cyan transition-opacity hover:opacity-90 cursor-pointer"
        >
          Volver
        </button>
      </div>

      <div className="col-span-2 row-start-1 text-center sm:col-span-1 sm:col-start-2">
        <h1 className="font-display text-lg font-semibold text-ink sm:text-2xl">Asistente Virtual de CaseBank</h1>
      </div>

      <div className="justify-self-end">
        <a href="https://soporte.sinteghn.com/clientes/login.php" target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-white rounded-md px-3 py-1.5 bg-gradient-to-r from-brand-blue to-sky-cyan transition-opacity hover:opacity-90 cursor-pointer">
          Crear ticket
        </a>
      </div>
    </div>
  )
}
