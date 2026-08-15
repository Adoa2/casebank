import { useRef, useState } from 'react'
import { uploadImagenError } from '../api/errors'

const TABS = [
  { id: 'general', label: 'Información General' },
  { id: 'solucion', label: 'Solución' },
]

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/jpg', 'image/png']

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
  const [requiereTicket, setRequiereTicket] = useState(initialData?.requiere_ticket || false)

  const [tieneEvidencia, setTieneEvidencia] = useState(initialData?.tiene_evidencia || false)
  const [imagenUrl, setImagenUrl] = useState(initialData?.imagen_url || null)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [imagenError, setImagenError] = useState(null)
  const fileInputRef = useRef(null)

  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const generalValid = titulo.trim() && modulo.trim() && descripcion.trim()
  const solucionValid = solucion.trim()

  async function subirArchivo(file) {
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setImagenError('Solo se permiten imágenes JPG, JPEG o PNG.')
      return
    }
    setImagenError(null)
    setSubiendoImagen(true)
    try {
      const { url } = await uploadImagenError(file)
      setImagenUrl(url)
    } catch (err) {
      setImagenError(err.message || 'No se pudo subir la imagen.')
    } finally {
      setSubiendoImagen(false)
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) subirArchivo(file)
    e.target.value = ''
  }

  function handlePaste(e) {
    if (!tieneEvidencia) return
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'))
    if (item) {
      const file = item.getAsFile()
      if (file) subirArchivo(file)
    }
  }

  function handleToggleEvidencia(checked) {
    setTieneEvidencia(checked)
    if (!checked) {
      setImagenUrl(null)
      setImagenError(null)
    }
  }

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
    if (tieneEvidencia && !imagenUrl) {
      setActiveTab('solucion')
      setError('Sube la imagen de evidencia antes de guardar, o desmarca la casilla.')
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
        requiere_ticket: requiereTicket,
        tiene_evidencia: tieneEvidencia,
        imagen_url: tieneEvidencia ? imagenUrl : null,
      })
    } catch (err) {
      setError(err.message || 'No se pudo guardar el error.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl sm:max-h-[90vh]">
        <div className="border-b border-line px-4 pt-4 sm:px-6 sm:pt-5">
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
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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

                <div className="flex items-start gap-2 rounded-lg border border-line bg-slate-50 px-3 py-3">
                  <input
                    id="requiereTicket"
                    type="checkbox"
                    checked={requiereTicket}
                    onChange={(e) => setRequiereTicket(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line text-brand-blue focus:ring-brand-blue/20"
                  />
                  <label htmlFor="requiereTicket" className="text-sm text-slate-600">
                    <span className="font-medium text-slate-700">Requiere ticket de soporte</span>
                    <br />
                    Cuando el asistente use esta solución para responder, agregará automáticamente el enlace para abrir un ticket.
                  </label>
                </div>

                <div className="rounded-lg border border-line bg-slate-50 px-3 py-3">
                  <div className="flex items-start gap-2">
                    <input
                      id="tieneEvidencia"
                      type="checkbox"
                      checked={tieneEvidencia}
                      onChange={(e) => handleToggleEvidencia(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-line text-brand-blue focus:ring-brand-blue/20"
                    />
                    <label htmlFor="tieneEvidencia" className="text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Tiene imagen de evidencia</span>
                      <br />
                      El asistente mostrará esta imagen antes de dar la solución, para que el usuario confirme si es su error.
                    </label>
                  </div>

                  {tieneEvidencia && (
                    <div className="mt-3">
                      <div
                        onPaste={handlePaste}
                        tabIndex={0}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-white px-4 py-6 text-center outline-none focus:border-brand-blue"
                      >
                        {subiendoImagen ? (
                          <p className="text-sm text-slate-500">Subiendo imagen...</p>
                        ) : imagenUrl ? (
                          <div className="flex flex-col items-center gap-2">
                            <img
                              src={imagenUrl}
                              alt="Evidencia del error"
                              className="max-h-40 rounded-lg border border-line object-contain"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setImagenUrl(null)
                              }}
                              className="text-xs font-medium text-red-600 hover:underline"
                            >
                              Quitar imagen
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-slate-600">
                              Haz clic para elegir un archivo o pega una imagen (Ctrl+V)
                            </p>
                            <p className="text-xs text-slate-400">JPG, JPEG o PNG, máximo 5 MB</p>
                          </>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      {imagenError && (
                        <p className="mt-2 text-xs text-red-600">{imagenError}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse justify-end gap-2 border-t border-line px-4 py-3 sm:flex-row sm:gap-3 sm:px-6 sm:py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || subiendoImagen}
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