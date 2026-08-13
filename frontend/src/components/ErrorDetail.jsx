import { useState } from 'react'

const TABS = [
  { id: 'general', label: 'Información General' },
  { id: 'solucion', label: 'Solución' },
  { id: 'procedimiento', label: 'Procedimiento' },
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
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '-'
  }
}

export default function ErrorDetail({ error, canReview, canEdit, onBack, onReview, onEdit, onDelete }) {
  const [activeTab, setActiveTab] = useState('general')
  const [reviewing, setReviewing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState(null)

  const keywords = (error.palabras_clave || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

  async function handleReview(aprobar) {
    setActionError(null)
    setReviewing(true)
    try {
      await onReview(error.id, aprobar)
    } catch (err) {
      setActionError(err.message || 'No se pudo revisar el error.')
    } finally {
      setReviewing(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`¿Eliminar el error "${error.titulo}"? Esta acción no se puede deshacer.`)) {
      return
    }
    setActionError(null)
    setDeleting(true)
    try {
      await onDelete(error.id)
    } catch (err) {
      setActionError(err.message || 'No se pudo eliminar el error.')
      setDeleting(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Errores Frecuentes
      </button>

      <div className="mb-5 flex flex-col items-start justify-between gap-3 lg:flex-row">
        <h1 className="text-xl font-semibold text-slate-900">Error: {error.titulo}</h1>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${ESTADO_BADGE[error.estado]}`}>
            {ESTADO_LABEL[error.estado] ?? error.estado}
          </span>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => onEdit(error)}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </>
          )}

          {canReview && error.estado === 'pendiente' && (
            <>
              <button
                type="button"
                onClick={() => handleReview(false)}
                disabled={reviewing}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => handleReview(true)}
                disabled={reviewing}
                className="rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan px-3 py-1.5 text-sm font-medium text-white hover:brightness-105 disabled:opacity-70"
              >
                {reviewing ? 'Procesando...' : 'Aprobar'}
              </button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-brand-blue text-brand-blue'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Descripción del error</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{error.descripcion}</p>
          </div>

          <div className="rounded-xl border border-line p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Causa</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{error.causa || 'No especificada.'}</p>
          </div>

          <div className="rounded-xl border border-line p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Palabras clave</h3>
            {keywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k) => (
                  <span key={k} className="rounded-full bg-blue-100 px-2.5 py-1 text-xs text-brand-blue">
                    {k}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Ninguna.</p>
            )}
          </div>

          <div className="rounded-xl border border-line p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Módulo relacionado</h3>
            <p className="text-sm text-slate-600">{error.modulo}</p>
          </div>

          <div className="rounded-xl border border-line p-4 sm:col-span-2">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Registrado</h3>
            <p className="text-sm text-slate-600">
              {formatDate(error.created_at)}
              {error.reviewed_at && ` · Revisado el ${formatDate(error.reviewed_at)}`}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'solucion' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Solución</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{error.solucion}</p>
          </div>

          {error.requiere_ticket && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-brand-blue">
              <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M9 12h6m-6 4h6M9 8h1M5 20V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14l-3-2-2 2-2-2-2 2-2-2-3 2Z" />
              </svg>
              Este error requiere que el usuario abra un ticket de soporte. El asistente incluirá el enlace automáticamente al responder.
            </div>
          )}
        </div>
      )}

      {activeTab === 'procedimiento' && (
        <div className="rounded-xl border border-line p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Procedimiento</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-600">
            {error.procedimiento || 'No se especificó un procedimiento detallado.'}
          </p>
        </div>
      )}
    </div>
  )
}
