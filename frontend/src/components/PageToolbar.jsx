export default function PageToolbar({ onGoHome }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line bg-white px-6 py-4">
      <div className="justify-self-start">
        <button
          type="button"
          onClick={onGoHome}
          className="text-sm font-medium text-white rounded-md px-3 py-1.5 bg-gradient-to-r from-brand-blue to-sky-cyan transition-opacity hover:opacity-90 cursor-pointer"
        >
          Volver
        </button>
      </div>

      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Asistente Virtual de CaseBank</h1>
      </div>

      <div className="justify-self-end">
        <a href="https://soporte.sinteghn.com/clientes/login.php" target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-white rounded-md px-3 py-1.5 bg-gradient-to-r from-brand-blue to-sky-cyan transition-opacity hover:opacity-90 cursor-pointer">
          Crear ticket
        </a>
      </div>
    </div>
  )
}