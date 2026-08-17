import { useEffect, useMemo, useState } from 'react'
import { fetchManualStructure } from '../api/manual'
import { buildJerarquiaAnidada } from '../utils/manualTree'

function aplanarDescendientes(nodo) {
  const resultado = []
  for (const hijo of nodo.hijos) {
    resultado.push(hijo)
    resultado.push(...aplanarDescendientes(hijo))
  }
  return resultado
}

function Field({ label, hint, children }) {
  return <div><label className="mb-1.5 block text-sm font-semibold text-[#17213e]">{label} <span className="text-red-500">*</span></label>{children}{hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}</div>
}

export default function VideoFormModal({ mode = 'create', initialData, onClose, onSubmit }) {
  const isEdit = mode === 'edit'
  const [titulo, setTitulo] = useState(initialData?.titulo || '')
  const [url, setUrl] = useState(initialData?.url || '')
  const [arbol, setArbol] = useState([])
  const [loadingArbol, setLoadingArbol] = useState(true)
  const [errorArbol, setErrorArbol] = useState(null)
  const [capituloId, setCapituloId] = useState('')
  const [seccionId, setSeccionId] = useState('')
  const [subseccionId, setSubseccionId] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      try {
        const estructura = buildJerarquiaAnidada(await fetchManualStructure())
        if (!cancelado) setArbol(estructura)
      } catch (err) {
        if (!cancelado) setErrorArbol(err.message || 'No se pudo cargar la estructura del manual.')
      } finally {
        if (!cancelado) setLoadingArbol(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [])

  useEffect(() => {
    if (!isEdit || !initialData || arbol.length === 0) return
    for (const capitulo of arbol) {
      for (const seccion of capitulo.hijos) {
        const pertenece = seccion.id === initialData.seccion_id || aplanarDescendientes(seccion).some((item) => item.id === initialData.seccion_id)
        if (pertenece) {
          setCapituloId(String(capitulo.id))
          setSeccionId(String(seccion.id))
          setSubseccionId(String(initialData.seccion_id))
          return
        }
      }
    }
  }, [isEdit, initialData, arbol])

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, saving])

  const capituloSeleccionado = arbol.find((item) => String(item.id) === capituloId)
  const secciones = capituloSeleccionado?.hijos || []
  const seccionSeleccionada = secciones.find((item) => String(item.id) === seccionId)
  const subsecciones = useMemo(() => {
    if (!seccionSeleccionada) return []
    const opciones = [{ id: seccionSeleccionada.id, titulo: '(Esta sección, sin subsección específica)', profundidad: 0 }]
    function recorrer(nodo, profundidad) {
      for (const hijo of nodo.hijos) {
        opciones.push({ id: hijo.id, titulo: hijo.titulo, profundidad })
        recorrer(hijo, profundidad + 1)
      }
    }
    recorrer(seccionSeleccionada, 1)
    return opciones
  }, [seccionSeleccionada])

  function handleCapituloChange(value) {
    setCapituloId(value)
    setSeccionId('')
    setSubseccionId('')
    setError(null)
  }

  function handleSeccionChange(value) {
    setSeccionId(value)
    setSubseccionId('')
    setError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (!titulo.trim()) return setError('El título es obligatorio.')
    if (!capituloId || !seccionId) return setError('Selecciona capítulo y sección.')
    if (!subseccionId) return setError('Selecciona la subsección o la opción de esta sección.')
    if (!/^https?:\/\//i.test(url.trim())) return setError('La URL debe comenzar con http:// o https://')

    const subseccionSeleccionada = subsecciones.find((item) => String(item.id) === subseccionId)
    const esLaMismaSeccion = subseccionSeleccionada?.id === seccionSeleccionada.id
    setSaving(true)
    try {
      await onSubmit({
        titulo: titulo.trim(),
        url: url.trim(),
        seccion_id: Number(subseccionId),
        capitulo: capituloSeleccionado.titulo,
        seccion: seccionSeleccionada.titulo,
        subseccion: esLaMismaSeccion ? null : subseccionSeleccionada?.titulo || null,
      })
    } catch (err) {
      setError(err.message || 'No se pudo guardar el video.')
      setSaving(false)
    }
  }

  const fieldClass = 'h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-[#17213e] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'
  const validUrl = /^https?:\/\//i.test(url.trim())

  return (
    <div className="video-form-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="video-modal-title" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="video-form-modal-panel flex flex-col overflow-hidden bg-white shadow-[0_28px_70px_rgba(15,23,42,.28)]">
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-8 sm:pt-7">
          <div className="flex items-center gap-4">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${isEdit ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}><svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{isEdit ? <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19 3 20l1-4Z" /> : <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3Z" /></>}</svg></span>
            <div><h2 id="video-modal-title" className="text-xl font-bold tracking-tight text-[#101a38] sm:text-[26px]">{isEdit ? 'Editar video' : 'Nuevo video'}</h2><p className="mt-1 text-xs text-slate-500 sm:text-sm">{isEdit ? 'Actualiza la información y ubicación de este video.' : 'Vincula un video formativo con una sección del manual.'}</p></div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-8 sm:py-4">
            {error && <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {errorArbol && <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{errorArbol}</div>}
            <div className="space-y-5">
              <Field label="Título" hint="Utiliza un título claro que describa el contenido del video."><input type="text" value={titulo} onChange={(event) => { setTitulo(event.target.value); setError(null) }} placeholder="Ej. Cómo ingresar un nuevo afiliado" autoFocus className={fieldClass} /></Field>

              <div className="rounded-xl border border-blue-100 bg-blue-50/35 p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-blue-600 shadow-sm"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4.5A3.5 3.5 0 0 1 7.5 3H11v17H7.5A3.5 3.5 0 0 0 4 21.5v-17ZM20 4.5A3.5 3.5 0 0 0 16.5 3H13v17h3.5a3.5 3.5 0 0 1 3.5 1.5v-17Z" /></svg></span><div><h3 className="text-sm font-semibold text-[#17213e]">Ubicación en el manual</h3><p className="text-xs text-slate-500">Selecciona la ruta donde aparecerá el video.</p></div></div>
                <div className="space-y-4">
                  <Field label="Capítulo"><select value={capituloId} onChange={(event) => handleCapituloChange(event.target.value)} disabled={loadingArbol} className={fieldClass}><option value="">{loadingArbol ? 'Cargando capítulos...' : 'Selecciona un capítulo'}</option>{arbol.map((capitulo) => <option key={capitulo.id} value={capitulo.id}>{capitulo.titulo}</option>)}</select></Field>
                  <Field label="Sección"><select value={seccionId} onChange={(event) => handleSeccionChange(event.target.value)} disabled={!capituloId} className={fieldClass}><option value="">{capituloId ? 'Selecciona una sección' : 'Primero elige un capítulo'}</option>{secciones.map((seccion) => <option key={seccion.id} value={seccion.id}>{seccion.titulo}</option>)}</select></Field>
                  <Field label="Subsección"><select value={subseccionId} onChange={(event) => { setSubseccionId(event.target.value); setError(null) }} disabled={!seccionId} className={fieldClass}><option value="">{seccionId ? 'Selecciona una opción' : 'Primero elige una sección'}</option>{subsecciones.map((subseccion) => <option key={subseccion.id} value={subseccion.id}>{'\u00A0\u00A0'.repeat(subseccion.profundidad)}{subseccion.titulo}</option>)}</select></Field>
                </div>
              </div>

              <Field label="URL del video" hint="Acepta enlaces públicos que comiencen con http:// o https://."><div className="relative"><svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" /></svg><input type="url" value={url} onChange={(event) => { setUrl(event.target.value); setError(null) }} placeholder="https://www.youtube.com/..." className={`${fieldClass} pl-12 pr-28`} />{validUrl && <a href={url.trim()} target="_blank" rel="noopener noreferrer" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100">Comprobar</a>}</div></Field>
            </div>
          </div>

          <footer className="video-form-modal-footer shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-8 sm:py-5"><button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-lg border border-slate-200 bg-white px-7 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50">Cancelar</button><button type="submit" disabled={saving || loadingArbol || Boolean(errorArbol)} className="inline-flex h-11 items-center justify-center gap-2.5 rounded-lg bg-gradient-to-r from-[#075fe5] to-[#17bce1] px-7 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(21,94,239,.22)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"><svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 3h12l2 2v16H5V3Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></svg>{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear video'}</button></footer>
        </form>
      </div>
    </div>
  )
}
