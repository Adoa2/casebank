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
        const secciones = await fetchManualStructure()
        const arbolConstruido = buildJerarquiaAnidada(secciones)
        if (!cancelado) setArbol(arbolConstruido)
      } catch (err) {
        if (!cancelado) setErrorArbol(err.message || 'No se pudo cargar la estructura del manual.')
      } finally {
        if (!cancelado) setLoadingArbol(false)
      }
    }
    cargar()
    return () => {
      cancelado = true
    }
  }, [])

  useEffect(() => {
    if (!isEdit || !initialData || arbol.length === 0) return

    for (const capitulo of arbol) {
      for (const seccion of capitulo.hijos) {
        const esLaSeccion = seccion.id === initialData.seccion_id
        const descendientes = aplanarDescendientes(seccion)
        const esDescendiente = descendientes.some((d) => d.id === initialData.seccion_id)

        if (esLaSeccion || esDescendiente) {
          setCapituloId(String(capitulo.id))
          setSeccionId(String(seccion.id))
          setSubseccionId(String(initialData.seccion_id))
          return
        }
      }
    }
  }, [isEdit, initialData, arbol])

  const capituloSeleccionado = arbol.find((c) => String(c.id) === capituloId)
  const secciones = capituloSeleccionado?.hijos || []
  const seccionSeleccionada = secciones.find((s) => String(s.id) === seccionId)

  const subsecciones = useMemo(() => {
    if (!seccionSeleccionada) return []
    const opciones = [
      { id: seccionSeleccionada.id, titulo: '(Esta sección, sin subsección específica)', profundidad: 0 },
    ]

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
  }

  function handleSeccionChange(value) {
    setSeccionId(value)
    setSubseccionId('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!titulo.trim()) {
      setError('El título es obligatorio.')
      return
    }
    if (!capituloId || !seccionId) {
      setError('Selecciona capítulo y sección.')
      return
    }
    if (!subseccionId) {
      setError('Selecciona la subsección, o la opción de "esta sección".')
      return
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      setError('La URL del video debe comenzar con http:// o https://')
      return
    }

    const subseccionSeleccionada = subsecciones.find((s) => String(s.id) === subseccionId)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6">
        <h2 className="mb-5 text-lg font-semibold text-slate-900">
          {isEdit ? 'Editar Video' : 'Nuevo Video'}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {errorArbol && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorArbol}</div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Título *</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Cómo ingresar un nuevo afiliado"
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Capítulo *</label>
              <select
                value={capituloId}
                onChange={(e) => handleCapituloChange(e.target.value)}
                disabled={loadingArbol}
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-slate-50"
              >
                <option value="">{loadingArbol ? 'Cargando...' : 'Selecciona un capítulo'}</option>
                {arbol.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titulo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Sección *</label>
              <select
                value={seccionId}
                onChange={(e) => handleSeccionChange(e.target.value)}
                disabled={!capituloId}
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-slate-50"
              >
                <option value="">{capituloId ? 'Selecciona una sección' : 'Primero elige un capítulo'}</option>
                {secciones.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titulo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Subsección *</label>
              <select
                value={subseccionId}
                onChange={(e) => setSubseccionId(e.target.value)}
                disabled={!seccionId}
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-slate-50"
              >
                <option value="">{seccionId ? 'Selecciona una opción' : 'Primero elige una sección'}</option>
                {subsecciones.map((s) => (
                  <option key={s.id} value={s.id}>
                    {'\u00A0\u00A0'.repeat(s.profundidad)}
                    {s.titulo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">URL del video *</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || loadingArbol}
              className="rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-70"
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar Video'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}