import AuthImage from './AuthImage'

export default function ManualContent({ chapter, subchapter }) {
  if (!subchapter) {
    return (
      <div className="flex-1 min-w-0 overflow-y-auto px-8 py-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="font-display text-2xl font-semibold mb-3">Manual interactivo de CaseBank</h1>
          <p className="text-slate leading-relaxed mb-6">
            Selecciona un capítulo del índice a la izquierda para ver su contenido.
          </p>

          <div className="border border-line rounded-xl p-5 bg-white">
            <h2 className="font-display text-base font-semibold mb-2">Sobre CaseBank</h2>
            <p className="text-sm text-slate leading-relaxed">
              Este espacio puede usarse para mostrar información general de la institución.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const imagenes = subchapter.imagenes || []
  const mostrarRangoPaginas =
    subchapter.paginaFin && subchapter.paginaFin !== subchapter.paginaInicio
      ? `${subchapter.paginaInicio} – ${subchapter.paginaFin}`
      : subchapter.paginaInicio

  return (
    <div className="flex-1 min-w-0 overflow-y-auto px-8 py-10">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-brand-blue font-medium mb-2">{chapter?.title}</p>
        <h1 className="font-display text-2xl font-semibold mb-1">{subchapter.title}</h1>
        {subchapter.paginaInicio != null && (
          <p className="text-xs text-slate mb-4">Página {mostrarRangoPaginas}</p>
        )}

        <div className="border border-line rounded-xl p-5 bg-white text-sm text-slate leading-relaxed whitespace-pre-line">
          {subchapter.contenido || 'Esta sección no tiene contenido de texto adicional.'}
        </div>

        {imagenes.length > 0 && (
          <div className="mt-6">
            <h2 className="font-display text-sm font-semibold text-ink mb-3">Imágenes relacionadas</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imagenes.map((nombre) => (
                <AuthImage key={nombre} nombreArchivo={nombre} alt={nombre} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}