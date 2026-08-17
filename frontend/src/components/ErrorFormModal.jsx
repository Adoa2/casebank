import { useEffect, useRef, useState } from 'react'
import { uploadImagenError } from '../api/errors'

const STEPS = [
  { id: 'informacion', label: 'Información' },
  { id: 'causa', label: 'Causa' },
  { id: 'solucion', label: 'Solución' },
  { id: 'revision', label: 'Revisión' },
]

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/jpg', 'image/png']
const MAX_FILE_SIZE = 5 * 1024 * 1024

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[#17213e] sm:text-[13px]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-4 text-slate-500 sm:text-xs">{hint}</p>}
    </div>
  )
}

function Stepper({ activeStep, onSelect }) {
  return (
    <nav className="error-form-stepper" aria-label="Progreso del formulario">
      {STEPS.map((step, index) => {
        const active = activeStep === index
        const completed = activeStep > index
        return (
          <div key={step.id} className="error-form-step">
            <button type="button" onClick={() => onSelect(index)} className={`group flex items-center gap-2 text-xs font-medium transition sm:text-sm ${active ? 'text-blue-600' : completed ? 'text-emerald-600' : 'text-slate-500'}`} aria-current={active ? 'step' : undefined}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition ${active ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : completed ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-300 bg-white text-slate-600 group-hover:border-blue-300'}`}>
                {completed ? <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m3.5 8 2.7 2.7 6.3-6.2" /></svg> : index + 1}
              </span>
              <span className="hidden min-[430px]:inline">{step.label}</span>
            </button>
            {index < STEPS.length - 1 && <span className={`error-form-step-line ${completed ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
          </div>
        )
      })}
    </nav>
  )
}

function ReviewItem({ label, value, wide = false }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-[#17213e]">{value || 'No especificado'}</p>
    </div>
  )
}

export default function ErrorFormModal({ mode = 'create', initialData, onClose, onSubmit }) {
  const isEdit = mode === 'edit'
  const [activeStep, setActiveStep] = useState(0)
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
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#17213e] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving && !subiendoImagen) onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, saving, subiendoImagen])

  function validateStep(step) {
    setError(null)
    if (step === 0 && (!titulo.trim() || !modulo.trim() || !descripcion.trim())) {
      setError('Completa el título, el módulo relacionado y la descripción del error.')
      return false
    }
    if (step === 2 && !solucion.trim()) {
      setError('Describe la solución antes de continuar.')
      return false
    }
    if (step === 2 && tieneEvidencia && !imagenUrl) {
      setError('Sube la imagen de evidencia o desmarca esa opción para continuar.')
      return false
    }
    return true
  }

  function goToStep(nextStep) {
    if (nextStep <= activeStep) {
      setError(null)
      setActiveStep(nextStep)
      return
    }
    for (let step = activeStep; step < nextStep; step += 1) {
      if (!validateStep(step)) {
        setActiveStep(step)
        return
      }
    }
    setActiveStep(nextStep)
  }

  async function subirArchivo(file) {
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setImagenError('Solo se permiten imágenes JPG, JPEG o PNG.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setImagenError('La imagen no puede superar los 5 MB.')
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

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (file) subirArchivo(file)
    event.target.value = ''
  }

  function handlePaste(event) {
    if (!tieneEvidencia) return
    const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (file) subirArchivo(file)
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) subirArchivo(file)
  }

  function handleToggleEvidencia(checked) {
    setTieneEvidencia(checked)
    if (!checked) {
      setImagenUrl(null)
      setImagenError(null)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!validateStep(0)) {
      setActiveStep(0)
      return
    }
    if (!validateStep(2)) {
      setActiveStep(2)
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
    <div className="error-form-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="error-form-title" onMouseDown={(event) => event.target === event.currentTarget && !saving && !subiendoImagen && onClose()}>
      <div className="error-form-modal-panel flex flex-col overflow-hidden bg-white shadow-[0_28px_70px_rgba(15,23,42,.28)]">
        <header className="shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="error-form-title" className="text-xl font-bold tracking-tight text-[#101a38] sm:text-2xl">{isEdit ? 'Editar error' : 'Nuevo error'}</h2>
              <p className="mt-1.5 text-xs text-slate-500 sm:text-sm">{isEdit ? 'Actualiza la información de este error conocido.' : 'Documenta el problema para facilitar su identificación y solución.'}</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving || subiendoImagen} aria-label="Cerrar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
          </div>
          <Stepper activeStep={activeStep} onSelect={goToStep} />
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7 sm:py-5" onPaste={handlePaste}>
            {error && <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            {activeStep === 0 && (
              <div className="space-y-4">
                <Field label="Título" required hint="Sé claro y específico para que el error sea fácil de encontrar.">
                  <input type="text" value={titulo} onChange={(event) => setTitulo(event.target.value)} placeholder="Ej. Error al guardar transacción" autoFocus className={inputClass} />
                </Field>
                <Field label="Módulo relacionado" required hint="Indica la sección del sistema donde ocurre el error.">
                  <input type="text" value={modulo} onChange={(event) => setModulo(event.target.value)} placeholder="Ej. Créditos" className={inputClass} />
                </Field>
                <Field label="Palabras clave (separadas por coma)" hint="Ayudan a encontrar el error mediante la búsqueda.">
                  <input type="text" value={palabrasClave} onChange={(event) => setPalabrasClave(event.target.value)} placeholder="Ej. transacción, guardar, error" className={inputClass} />
                </Field>
                <Field label="Descripción del error" required hint="Incluye el mensaje exacto y los pasos necesarios para reproducirlo.">
                  <textarea value={descripcion} onChange={(event) => setDescripcion(event.target.value)} rows={4} placeholder="Describe qué ocurre, cuándo sucede y qué mensaje muestra el sistema..." className={`${inputClass} min-h-[108px] resize-y`} />
                </Field>
              </div>
            )}

            {activeStep === 1 && (
              <div>
                <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-blue-600 shadow-sm">i</span><div><p className="text-sm font-semibold text-[#17213e]">Identifica el origen del problema</p><p className="mt-1 text-xs leading-5 text-slate-500">Una causa precisa ayuda a evitar que el mismo error vuelva a ocurrir. Si aún no se conoce, puedes continuar sin completarla.</p></div></div>
                </div>
                <Field label="Causa probable" hint="Describe condiciones, configuraciones o acciones que pudieron originar el error.">
                  <textarea value={causa} onChange={(event) => setCausa(event.target.value)} rows={8} placeholder="Ej. La sesión expiró antes de que terminara el proceso de guardado..." autoFocus className={`${inputClass} min-h-[190px] resize-y`} />
                </Field>
              </div>
            )}

            {activeStep === 2 && (
              <div className="space-y-4">
                <Field label="Solución" required hint="Explica de forma breve qué debe hacer el usuario para resolver el problema.">
                  <textarea value={solucion} onChange={(event) => setSolucion(event.target.value)} rows={5} placeholder="Describe la solución recomendada..." autoFocus className={`${inputClass} min-h-[120px] resize-y`} />
                </Field>
                <Field label="Procedimiento detallado" hint="Agrega instrucciones numeradas si la solución requiere varios pasos.">
                  <textarea value={procedimiento} onChange={(event) => setProcedimiento(event.target.value)} rows={4} placeholder={'1. Ingresa al módulo...\n2. Selecciona la opción...'} className={`${inputClass} min-h-[100px] resize-y`} />
                </Field>

                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${requiereTicket ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-slate-50/60 hover:border-blue-200'}`}>
                  <input type="checkbox" checked={requiereTicket} onChange={(event) => setRequiereTicket(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200" />
                  <span className="text-xs leading-5 text-slate-500"><strong className="block text-sm text-[#17213e]">Requiere ticket de soporte</strong>El asistente incluirá automáticamente el enlace para abrir un ticket.</span>
                </label>

                <div className={`rounded-xl border p-4 transition ${tieneEvidencia ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 bg-slate-50/60'}`}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={tieneEvidencia} onChange={(event) => handleToggleEvidencia(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200" />
                    <span className="text-xs leading-5 text-slate-500"><strong className="block text-sm text-[#17213e]">Agregar imagen de evidencia</strong>Permite que el usuario confirme visualmente que se trata del mismo error.</span>
                  </label>
                  {tieneEvidencia && (
                    <div className="mt-4">
                      <div role="button" tabIndex={0} onClick={() => !subiendoImagen && fileInputRef.current?.click()} onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && fileInputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} className={`flex min-h-[130px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-white px-4 py-5 text-center outline-none transition focus:border-blue-500 ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400'}`}>
                        {subiendoImagen ? <><span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /><p className="text-sm text-slate-500">Subiendo imagen...</p></> : imagenUrl ? <><img src={imagenUrl} alt="Evidencia del error" className="max-h-40 rounded-lg border border-slate-200 object-contain" /><button type="button" onClick={(event) => { event.stopPropagation(); setImagenUrl(null) }} className="text-xs font-semibold text-red-600 hover:underline">Quitar imagen</button></> : <><svg className="h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 16V4m0 0L8 8m4-4 4 4M5 14v5h14v-5" /></svg><p className="text-sm font-medium text-slate-700">Arrastra, pega o selecciona una imagen</p><p className="text-xs text-slate-400">JPG o PNG, máximo 5 MB</p></>}
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" onChange={handleFileChange} className="hidden" />
                      {imagenError && <p className="mt-2 text-xs text-red-600">{imagenError}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeStep === 3 && (
              <div>
                <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-600"><svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 8 2.7 2.7L13 4" /></svg></span><div><p className="text-sm font-semibold text-[#17213e]">Todo listo para guardar</p><p className="mt-0.5 text-xs text-slate-500">Revisa la información antes de confirmar.</p></div></div></div>
                <div className="grid grid-cols-1 gap-x-8 gap-y-5 rounded-xl border border-slate-200 p-5 sm:grid-cols-2">
                  <ReviewItem label="Título" value={titulo} />
                  <ReviewItem label="Módulo" value={modulo} />
                  <ReviewItem label="Palabras clave" value={palabrasClave} wide />
                  <ReviewItem label="Descripción" value={descripcion} wide />
                  <ReviewItem label="Causa" value={causa} wide />
                  <ReviewItem label="Solución" value={solucion} wide />
                  <ReviewItem label="Procedimiento" value={procedimiento} wide />
                  <ReviewItem label="Soporte" value={requiereTicket ? 'Requiere ticket de soporte' : 'No requiere ticket'} />
                  <ReviewItem label="Evidencia" value={tieneEvidencia ? 'Imagen adjunta' : 'Sin imagen'} />
                </div>
              </div>
            )}
          </div>

          <footer className="error-form-footer shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
            <button type="button" onClick={onClose} disabled={saving || subiendoImagen} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
            <div className="flex gap-2.5">
              {activeStep > 0 && <button type="button" onClick={(event) => { event.preventDefault(); goToStep(activeStep - 1) }} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>Anterior</button>}
              {activeStep < STEPS.length - 1 ? <button key="next-step" type="button" onClick={(event) => { event.preventDefault(); goToStep(activeStep + 1) }} disabled={subiendoImagen} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#075fe5] to-[#19bfe3] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(21,94,239,.2)] transition hover:brightness-105 disabled:opacity-60">Siguiente<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></button> : <button key="submit-error" type="submit" disabled={saving || subiendoImagen} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#075fe5] to-[#19bfe3] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(21,94,239,.2)] transition hover:brightness-105 disabled:opacity-60">{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar error'}</button>}
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
