import { useEffect, useMemo, useState } from 'react'
import { listErrors, createError, updateError, deleteError, reviewError } from '../api/errors'
import { listUsers } from '../api/adminUsers'
import { getRole } from '../api/authToken'
import ErrorFormModal from './ErrorFormModal'
import ErrorDetail from './ErrorDetail'

const ESTADO_FILTERS = [
  { id: 'todos', label: 'Todos', badge: 'bg-blue-100 text-blue-700' },
  { id: 'pendiente', label: 'Pendientes', badge: 'bg-amber-100 text-amber-700' },
  { id: 'aprobado', label: 'Aprobados', badge: 'bg-emerald-100 text-emerald-700' },
  { id: 'rechazado', label: 'Rechazados', badge: 'bg-red-100 text-red-700' },
]

const ESTADO_BADGE = {
  pendiente: 'bg-amber-50 text-amber-700 ring-amber-200',
  aprobado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rechazado: 'bg-red-50 text-red-700 ring-red-200',
}

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}

function formatDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '-'
  }
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset ${ESTADO_BADGE[status] || 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {status === 'aprobado' ? <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.2 2.2 4.8-5" /></> : status === 'rechazado' ? <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      </svg>
      {ESTADO_LABEL[status] ?? status}
    </span>
  )
}

function DocumentIcon() {
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#0875f5]">
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h4M10 12h5M10 16h5" />
      </svg>
    </span>
  )
}

function ViewButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#0767df] shadow-sm transition hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      Ver
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
    </button>
  )
}

export default function ErrorsSection({ onDetailChange }) {
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('todos')
  const [modalMode, setModalMode] = useState(null)
  const [selectedError, setSelectedError] = useState(null)
  const [userNames, setUserNames] = useState({})

  const canReview = getRole() >= 2
  const canEdit = getRole() >= 1
  const viewingDetail = Boolean(selectedError)

  useEffect(() => {
    onDetailChange?.(viewingDetail)
    return () => onDetailChange?.(false)
  }, [viewingDetail, onDetailChange])

  async function loadErrors() {
    setLoading(true)
    setError(null)
    try {
      const [data, users] = await Promise.all([listErrors(), listUsers()])
      setErrors(data)
      setUserNames(Object.fromEntries(users.map((user) => [user.id, user.username])))
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
    if (estadoFilter !== 'todos') list = list.filter((item) => item.estado === estadoFilter)
    const query = search.trim().toLowerCase()
    if (query) {
      list = list.filter((item) => item.titulo.toLowerCase().includes(query) || item.modulo.toLowerCase().includes(query))
    }
    return list
  }, [errors, estadoFilter, search])

  const filterCounts = useMemo(() => ({
    todos: errors.length,
    pendiente: errors.filter((item) => item.estado === 'pendiente').length,
    aprobado: errors.filter((item) => item.estado === 'aprobado').length,
    rechazado: errors.filter((item) => item.estado === 'rechazado').length,
  }), [errors])

  function closeModal() {
    setModalMode(null)
  }

  async function handleFormSubmit(payload) {
    if (modalMode === 'edit') {
      const updated = await updateError(selectedError.id, payload)
      setErrors((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
      setSelectedError(updated)
    } else {
      const created = await createError(payload)
      setErrors((previous) => [created, ...previous])
    }
    closeModal()
  }

  async function handleReview(id, aprobar) {
    const updated = await reviewError(id, aprobar)
    setErrors((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
    setSelectedError(updated)
  }

  async function handleDelete(id) {
    await deleteError(id)
    setErrors((previous) => previous.filter((item) => item.id !== id))
    setSelectedError(null)
  }

  if (selectedError) {
    return (
      <>
        <ErrorDetail
          error={selectedError}
          canReview={canReview}
          canEdit={canEdit}
          userNames={userNames}
          onBack={() => setSelectedError(null)}
          onReview={handleReview}
          onEdit={() => setModalMode('edit')}
          onDelete={handleDelete}
        />
        {modalMode === 'edit' && (
          <ErrorFormModal mode="edit" initialData={selectedError} onClose={closeModal} onSubmit={handleFormSubmit} />
        )}
      </>
    )
  }

  const feedback = loading ? 'Cargando errores...' : error || (filteredErrors.length === 0 ? 'No se encontraron errores.' : null)

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-[#0875f5] shadow-sm sm:h-16 sm:w-16">
            <svg className="h-9 w-9" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M12 2.2 20 5v6c0 5.2-3.2 9-8 10.8C7.2 20 4 16.2 4 11V5l8-2.8Z" />
              <path d="M12 7v6m0 3h.01" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#0b1739] sm:text-[28px]">Errores Frecuentes</h1>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">Base de errores conocidos y sus soluciones.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalMode('create')}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#075fe5] to-[#2697f2] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(21,94,239,.2)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-blue-300 sm:w-auto"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo Error
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(30,55,90,.08)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <label className="relative block w-full lg:max-w-[470px]">
            <span className="sr-only">Buscar por título o módulo</span>
            <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título o módulo..."
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-1 sm:items-center sm:justify-around">
            {ESTADO_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setEstadoFilter(filter.id)}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  estadoFilter === filter.id
                    ? 'border border-blue-300 bg-blue-50 text-[#075fe5]'
                    : 'border border-transparent text-[#0b1739] hover:bg-slate-50'
                }`}
              >
                {filter.label}
                <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${filter.badge}`}>
                  {filterCounts[filter.id]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-[310px] overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(30,55,90,.08)]">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px] table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/40 text-xs font-semibold uppercase tracking-wide text-[#17213e]">
              <tr>
                <th className="w-[43%] px-6 py-5">Título</th>
                <th className="w-[15%] px-5 py-5">Módulo</th>
                <th className="w-[15%] px-5 py-5">Estado</th>
                <th className="w-[16%] px-5 py-5">Creado</th>
                <th className="w-[11%] px-5 py-5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {feedback && (
                <tr><td colSpan={5} className={`px-6 py-16 text-center ${error ? 'text-red-600' : 'text-slate-400'}`}>{feedback}</td></tr>
              )}
              {!feedback && filteredErrors.map((item) => (
                <tr key={item.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50/50">
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-4">
                      <DocumentIcon />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#101a38]">{item.titulo}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{item.descripcion}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-6 text-[#17213e]">
                    <span className="flex items-center gap-2 truncate">
                      <svg className="h-5 w-5 shrink-0 text-[#0875f5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 7h7l2 2h9v10H3z" /><path d="M3 7V5h7l2 2" /></svg>
                      <span className="truncate">{item.modulo}</span>
                    </span>
                  </td>
                  <td className="px-5 py-6"><StatusBadge status={item.estado} /></td>
                  <td className="px-5 py-6 text-[#17213e]">
                    <div className="flex items-start gap-2">
                      <svg className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></svg>
                      <span>{formatDate(item.created_at)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-6 text-center"><ViewButton onClick={() => setSelectedError(item)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-200 md:hidden">
          {feedback && <p className={`px-5 py-14 text-center text-sm ${error ? 'text-red-600' : 'text-slate-400'}`}>{feedback}</p>}
          {!feedback && filteredErrors.map((item) => (
            <article key={item.id} className="p-4 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <DocumentIcon />
                <div className="min-w-0">
                  <h2 className="font-semibold leading-5 text-[#101a38]">{item.titulo}</h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.descripcion}</p>
                </div>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
                <div><span className="block text-slate-400">Módulo</span><strong className="mt-1 block truncate text-slate-700">{item.modulo}</strong></div>
                <div><span className="block text-slate-400">Creado</span><strong className="mt-1 block text-slate-700">{formatDate(item.created_at)}</strong></div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <StatusBadge status={item.estado} />
                <ViewButton onClick={() => setSelectedError(item)} />
              </div>
            </article>
          ))}
        </div>
      </div>

      {modalMode === 'create' && <ErrorFormModal mode="create" onClose={closeModal} onSubmit={handleFormSubmit} />}
    </section>
  )
}
