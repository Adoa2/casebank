// Botón secundario de borde punteado para agregar elementos a una lista de un formulario
// (ej. "+ Agregar otra opción" en errores o "+ Agregar paso" en videos con IA).

/** Botón "+ Agregar ..." con borde punteado; admite disabled y demás atributos de <button>. */
export default function BotonAgregarPunteado({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
