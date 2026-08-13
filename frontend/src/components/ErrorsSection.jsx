import { useEffect, useMemo, useState } from 'react'
import { listErrors, createError, updateError, deleteError, reviewError } from '../api/errors'
import { getRole } from '../api/authToken'
import ErrorFormModal from './ErrorFormModal'
import ErrorDetail from './ErrorDetail'

const ESTADO_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'aprobado', label: 'Aprobados' },
  { id: 'rechazado', label: 'Rechazados' },
]

const ESTADO_BADGE = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  aprobado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
}

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '-'
  }
}

export default function ErrorsSection() {
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('todos')
  const [modalMode, setModalMode] = useState(null) // null | 'create' | 'edit'
  const [selectedError, setSelectedError] = useState(null)

  const canReview = getRole() >= 2
  const canEdit = getRole() >= 1

  async function loadErrors() {
    setLoading(true)
    setError(null)
    try {
      const data = await listErrors()
      setErrors(data)
    } catch (err) {
      setError(err.message || 'No se pudo cargar la lista de errores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadErrors()
  }, [])

  const filteredErrors = useMemo(() => {
    let list = errors
    if (estadoFilter !== 'todos') {
      list = list.filter((e) => e.estado === estadoFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (e) => e.titulo.toLowerCase().includes(q) || e.modulo.toLowerCase().includes(q)
      )
    }
    return list
  }, [errors, estadoFilter, search])

  function openCreate() {
    setModalMode('create')
  }

  function openEdit() {
    setModalMode('edit')
  }

  function closeModal() {
    setModalMode(null)
  }

  async function handleFormSubmit(payload) {
    if (modalMode === 'edit') {
      const updated = await updateError(selectedError.id, payload)
      setErrors((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
      setSelectedError(updated)
    } else {
      const created = await createError(payload)
      setErrors((prev) => [created, ...prev])
    }
    closeModal()
  }

  async function handleReview(id, aprobar) {
    const updated = await reviewError(id, aprobar)
    setErrors((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    setSelectedError(updated)
  }

  async function handleDelete(id) {
    await deleteError(id)
    setErrors((prev) => prev.filter((e) => e.id !== id))
    setSelectedError(null)
  }

  if (selectedError) {
    return (
      <>
        <ErrorDetail
          error={selectedError}
          canReview={canReview}
          canEdit={canEdit}
          onBack={() => setSelectedError(null)}
          onReview={handleReview}
          onEdit={openEdit}
          onDelete={handleDelete}
        />

        {modalMode === 'edit' && (
          <ErrorFormModal
            mode="edit"
            initialData={selectedError}
            onClose={closeModal}
            onSubmit={handleFormSubmit}
          />
        )}
      </>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Errores Frecuentes</h1>
          <p className="text-sm text-slate">Base de errores conocidos y sus soluciones</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
        >
          + Nuevo Error
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o módulo..."
          className="w-full max-w-sm rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        />

        <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
          {ESTADO_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setEstadoFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                estadoFilter === f.id
                  ? 'bg-blue-100 text-brand-blue'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="min-w-[680px] w-full text-left text-sm">
          <thead className="bg-blue-50/60 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Título</th>
              <th className="px-4 py-3 font-medium">Módulo</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Creado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Cargando errores...
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && filteredErrors.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No se encontraron errores.
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              filteredErrors.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-slate-900">{e.titulo}</td>
                  <td className="px-4 py-3 text-slate-600">{e.modulo}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_BADGE[e.estado]}`}>
                      {ESTADO_LABEL[e.estado] ?? e.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(e.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedError(e)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-blue hover:bg-blue-50"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modalMode === 'create' && (
        <ErrorFormModal mode="create" onClose={closeModal} onSubmit={handleFormSubmit} />
      )}
    </div>
  )
}
