import { useState } from 'react'

const TABS = [
  { id: 'general', label: 'Información General' },
  { id: 'solucion', label: 'Solución' },
]

export default function ErrorFormModal({ mode = 'create', initialData, onClose, onSubmit }) {
  const isEdit = mode === 'edit'
  const [activeTab, setActiveTab] = useState('general')

  const [titulo, setTitulo] = useState(initialData?.titulo || '')
  const [modulo, setModulo] = useState(initialData?.modulo || '')
  const [palabrasClave, setPalabrasClave] = useState(initialData?.palabras_clave || '')
  const [descripcion, setDescripcion] = useState(initialData?.descripcion || '')
  const [causa, setCausa] = useState(initialData?.causa || '')
  const [solucion, setSolucion] = useState(initialData?.solucion || '')
  const [procedimiento, setProcedimiento] = useState(initialData?.procedimiento || '')

  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const generalValid = titulo.trim() && modulo.trim() && descripcion.trim()
  const solucionValid = solucion.trim()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!generalValid) {
      setActiveTab('general')
      setError('Completa título, módulo relacionado y descripción del error.')
      return
    }
    if (!solucionValid) {
      setActiveTab('solucion')
      setError('La solución es obligatoria.')
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        titulo: titulo.trim(),
        modulo: modulo.trim(),
        descripcion: descripcion.trim(),
        causa: causa.trim() || null,
        solucion: solucion.trim(),
        procedimiento: procedimiento.trim() || null,
        palabras_clave: palabrasClave.trim() || null,
      })
    } catch (err) {
      setError(err.message || 'No se pudo guardar el error.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="border-b border-line px-6 pt-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {isEdit ? 'Editar Error' : 'Nuevo Error'}
          </h2>
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-brand-blue text-brand-blue'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden" noValidate>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            {activeTab === 'general' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Título *</label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ej. Error al guardar transacción"
                    className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Módulo relacionado *</label>
                  <input
                    type="text"
                    value={modulo}
                    onChange={(e) => setModulo(e.target.value)}
                    placeholder="Ej. Créditos"
                    className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Palabras clave <span className="font-normal text-slate-400">(separadas por coma)</span>
                  </label>
                  <input
                    type="text"
                    value={palabrasClave}
                    onChange={(e) => setPalabrasClave(e.target.value)}
                    placeholder="tasa, interés, plan de pago"
                    className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Descripción del error *</label>
                  <textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    rows={4}
                    placeholder="Describe el error que presenta el sistema..."
                    className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Causa</label>
                  <textarea
                    value={causa}
                    onChange={(e) => setCausa(e.target.value)}
                    rows={3}
                    placeholder="Describe la causa del error..."
                    className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
              </div>
            )}

            {activeTab === 'solucion' && (
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Solución *</label>
                  <textarea
                    value={solucion}
                    onChange={(e) => setSolucion(e.target.value)}
                    rows={6}
                    placeholder="Pasos para solucionar el problema..."
                    className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Procedimiento</label>
                  <textarea
                    value={procedimiento}
                    onChange={(e) => setProcedimiento(e.target.value)}
                    rows={5}
                    placeholder="Procedimiento detallado, si aplica..."
                    className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-70"
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar Error'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}