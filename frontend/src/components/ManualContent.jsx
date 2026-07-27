export default function ManualContent({ chapter, subchapter }) {
  if (!subchapter) {
    return (
      <div className="flex-1 min-w-0 overflow-y-auto px-8 py-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="font-display text-2xl font-semibold mb-3">Manual interactivo de CaseBank</h1>
          <p className="text-slate leading-relaxed mb-6">
            Selecciona un capítulo del índice a la izquierda para ver su contenido. Cuando el procesamiento del
            manual esté conectado, aquí se mostrará el texto real de cada sección junto con sus imágenes.
          </p>

          <div className="border border-line rounded-xl p-5 bg-white">
            <h2 className="font-display text-base font-semibold mb-2">Sobre CaseBank</h2>
            <p className="text-sm text-slate leading-relaxed">
              Este espacio puede usarse para mostrar información general de la institución. Es contenido de ejemplo por ahora.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto px-8 py-10">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-brand-blue font-medium mb-2">{chapter?.title}</p>
        <h1 className="font-display text-2xl font-semibold mb-4">{subchapter.title}</h1>

        <div className="border border-line rounded-xl p-5 bg-white text-sm text-slate leading-relaxed">
          Este es contenido de ejemplo. Aquí se mostrará el texto real de esta sección, extraído del PDF, una vez
          se conecte esta vista al backend.
        </div>
      </div>
    </div>
  )
}
