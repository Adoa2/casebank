import { useState } from 'react'

const TABS = [
  { id: 'general', label: 'Información general' },
  { id: 'solucion', label: 'Solución' },
  { id: 'procedimiento', label: 'Procedimiento' },
]

const DIAGNOSTICO_TITULO_FIJO = '¿Qué acción está realizando?'

const STATUS = {
  pendiente: {
    label: 'Pendiente',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    panel: 'border-amber-200 bg-amber-50/45',
    icon: 'bg-amber-100 text-amber-600',
    description: 'Este error está pendiente de revisión y aprobación.',
  },
  aprobado: {
    label: 'Aprobado',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    panel: 'border-emerald-200 bg-emerald-50/45',
    icon: 'bg-emerald-100 text-emerald-600',
    description: 'Este error fue revisado y aprobado.',
  },
  rechazado: {
    label: 'Rechazado',
    badge: 'bg-red-50 text-red-700 ring-red-200',
    panel: 'border-red-200 bg-red-50/45',
    icon: 'bg-red-100 text-red-600',
    description: 'Este error fue revisado y rechazado.',
  },
}

function formatDate(iso) {
  if (!iso) return '-'
  try {
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' }
    return new Date(iso).toLocaleDateString('es-HN', options)
  } catch {
    return '-'
  }
}

function Icon({ name, className = 'h-5 w-5' }) {
  const paths = {
    alert: <><path d="M10.3 3.7 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    edit: <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19 3 20l1-4Z" />,
    trash: <><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" /><path d="M10 11v5m4-5v5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    document: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6m-6 4h6m-6 4h4" /></>,
    cause: <><path d="M9 3h6v3l3 2v8l-3 2v3H9v-3l-3-2V8l3-2V3Z" /><path d="m9.5 12 1.7 1.7 3.5-3.7" /></>,
    tag: <><path d="M20 13 13 20 3 10V3h7l10 10Z" /><circle cx="7.5" cy="7.5" r="1" /></>,
    module: <path d="M8 3h4v4h4V3h4v5h-3v4h3v5h-4v4h-5v-3H7v3H3v-5h3v-4H3V7h5V3Z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></>,
    status: <><path d="M12 2.8 19 6v5.2c0 4.5-2.8 8-7 9.8-4.2-1.8-7-5.3-7-9.8V6l7-3.2Z" /><path d="m9.2 11.7 1.8 1.8 4-4" /></>,
    user: <><circle cx="12" cy="7" r="3" /><path d="M5 21v-2c0-3.3 2.3-5 7-5s7 1.7 7 5v2" /></>,
    article: <><path d="M6 3h9l3 3v15H6V3Z" /><path d="M14 3v4h4M9 11h6m-6 4h6" /></>,
    ticket: <><path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2V4Z" /><path d="M9 9h6m-6 4h6" /></>,
    branch: <><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 8v8M8 6h4a4 4 0 0 1 4 4v0M8 18h4a4 4 0 0 0 4-4v0" /></>,
  }
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function InfoCard({ icon, iconStyle, title, value, helper, wide = false, children }) {
  return (
    <article className={`flex min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconStyle}`}><Icon name={icon} className="h-5 w-5" /></span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[#17213e]">{title}</h3>
        {children || <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-[#25304d]">{value}</p>}
        {helper && <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>}
      </div>
    </article>
  )
}

function ActionButton({ tone = 'neutral', icon, children, ...props }) {
  const styles = {
    neutral: 'border-slate-200 bg-white text-[#17213e] hover:bg-slate-50',
    blue: 'border-blue-200 bg-white text-blue-600 hover:bg-blue-50',
    red: 'border-red-200 bg-red-50/40 text-red-600 hover:bg-red-50',
    primary: 'border-blue-600 bg-gradient-to-r from-[#075fe5] to-[#1479ef] text-white shadow-[0_8px_18px_rgba(21,94,239,.18)] hover:brightness-105',
  }
  return <button type="button" className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 ${styles[tone]}`} {...props}><Icon name={icon} className="h-4 w-4" />{children}</button>
}

export default function ErrorDetail({ error, canReview, canEdit, userNames = {}, onBack, onReview, onEdit, onDelete }) {
  const [activeTab, setActiveTab] = useState('general')
  const [reviewing, setReviewing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState(null)
  const keywords = (error.palabras_clave || '').split(',').map((keyword) => keyword.trim()).filter(Boolean)
  const status = STATUS[error.estado] || STATUS.pendiente
  const creatorName = error.created_by_name || userNames[error.created_by] || 'No disponible'
  const reviewerName = error.reviewed_by_name || userNames[error.reviewed_by] || (error.reviewed_by ? 'No disponible' : 'Pendiente')
  const diagnosticoOpciones = error.diagnostico_opciones || []

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
    if (!window.confirm(`¿Eliminar el error "${error.titulo}"? Esta acción no se puede deshacer.`)) return
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
    <section className="flex flex-1 flex-col">
      <button type="button" onClick={onBack} className="group mb-6 inline-flex h-11 w-fit items-center gap-3 rounded-xl border border-blue-100 bg-white px-3.5 pr-4 text-sm font-semibold text-[#0866df] shadow-[0_4px_14px_rgba(30,94,180,.08)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-[0_7px_18px_rgba(30,94,180,.13)] focus:outline-none focus:ring-4 focus:ring-blue-100 active:translate-y-0">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white"><svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg></span>
        Volver a errores frecuentes
      </button>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(30,55,90,.08)]">
        <header className="flex flex-col gap-5 px-5 pb-5 pt-5 sm:px-7 sm:pt-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-red-50 text-red-500"><Icon name="alert" className="h-8 w-8" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="break-words text-xl font-bold tracking-tight text-[#101a38] sm:text-2xl">Error: {error.titulo}</h1>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${status.badge}`}>{status.label}</span>
              </div>
              <p className="mt-1.5 text-sm text-slate-500">Base de errores conocidos</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
            {canEdit && <><ActionButton tone="blue" icon="edit" onClick={() => onEdit(error)}>Editar</ActionButton><ActionButton tone="red" icon="trash" onClick={handleDelete} disabled={deleting}>{deleting ? 'Eliminando...' : 'Eliminar'}</ActionButton></>}
            {canReview && error.estado === 'pendiente' && <><ActionButton icon="close" onClick={() => handleReview(false)} disabled={reviewing}>Rechazar</ActionButton><ActionButton tone="primary" icon="check" onClick={() => handleReview(true)} disabled={reviewing}>{reviewing ? 'Procesando...' : 'Aprobar'}</ActionButton></>}
          </div>
        </header>

        {actionError && <div role="alert" className="mx-5 mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7">{actionError}</div>}

        <nav className="mx-5 flex gap-1 overflow-x-auto border-b border-slate-200 sm:mx-7" aria-label="Contenido del error">
          {TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-[#17213e] hover:text-blue-600'}`}>{tab.label}</button>)}
        </nav>

        <div className="px-5 py-5 sm:px-7 sm:py-6">
          {activeTab === 'general' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoCard icon="document" iconStyle="bg-blue-50 text-blue-600" title="Descripción del error" value={error.descripcion} helper="Detalle completo del error reportado en el sistema." />
              <InfoCard icon="cause" iconStyle="bg-purple-50 text-purple-600" title="Causa" value={error.causa || 'No especificada.'} helper="Origen o motivo por el cual se presenta este error." />
              <InfoCard icon="tag" iconStyle="bg-emerald-50 text-emerald-600" title="Palabras clave" helper="Términos relacionados que facilitan su búsqueda.">
                {keywords.length ? <div className="mt-2 flex flex-wrap gap-2">{keywords.map((keyword) => <span key={keyword} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{keyword}</span>)}</div> : <p className="mt-1 text-sm text-slate-400">Ninguna.</p>}
              </InfoCard>
              <InfoCard icon="module" iconStyle="bg-amber-50 text-amber-600" title="Módulo relacionado" value={error.modulo} helper="Módulo o sección del sistema donde ocurre el error." />
            </div>
          )}

          {activeTab === 'solucion' && (
            <div className="space-y-4">
              {!error.tiene_diagnostico && (
                <InfoCard icon="check" iconStyle="bg-emerald-50 text-emerald-600" title="Solución recomendada" value={error.solucion} helper="Respuesta que recibirá el usuario para resolver el problema." wide />
              )}
              {error.requiere_ticket && <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-700"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white"><Icon name="ticket" className="h-5 w-5" /></span><div><strong>Requiere ticket de soporte</strong><p className="mt-1 text-xs leading-5 text-blue-600">El asistente incluirá automáticamente el enlace para abrir un ticket.</p></div></div>}
              {error.tiene_evidencia && error.imagen_url && <div className="rounded-xl border border-slate-200 p-4 sm:p-5"><h3 className="text-sm font-semibold text-[#17213e]">Imagen de evidencia</h3><p className="mt-1 text-xs text-slate-500">Referencia visual que se mostrará antes de brindar la solución.</p><a href={error.imagen_url} target="_blank" rel="noopener noreferrer" className="mt-4 block w-fit"><img src={error.imagen_url} alt="Evidencia del error" className="max-h-72 rounded-xl border border-slate-200 object-contain" /></a></div>}

              {error.tiene_diagnostico && (
                <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><Icon name="branch" className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[#17213e]">Diagnóstico interactivo</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Tras confirmar que es este error, Casey siempre pregunta lo siguiente y responde según la opción elegida:
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 rounded-lg bg-blue-50/60 px-3.5 py-2.5 text-sm font-semibold text-[#17213e]">
                    {DIAGNOSTICO_TITULO_FIJO}
                  </p>

                  {diagnosticoOpciones.length ? (
                    <ul className="mt-3 space-y-3">
                      {diagnosticoOpciones.map((opcion) => (
                        <li key={opcion.id} className="rounded-lg border border-slate-200 bg-white p-3.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{opcion.pregunta}</p>
                          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-[#25304d]">{opcion.respuesta}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">No hay opciones configuradas.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'procedimiento' && (
            error.tiene_diagnostico
              ? <InfoCard icon="branch" iconStyle="bg-blue-50 text-blue-600" title="No aplica" value="La respuesta se define en el diagnóstico interactivo (pestaña Solución), no en un procedimiento único." wide />
              : <InfoCard icon="document" iconStyle="bg-blue-50 text-blue-600" title="Procedimiento detallado" value={error.procedimiento || 'No se especificó un procedimiento detallado.'} helper="Pasos sugeridos para aplicar la solución." wide />
          )}

          <div className={`mt-5 rounded-xl border p-4 sm:p-5 ${status.panel}`}>
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${status.icon}`}><Icon name="status" className="h-5 w-5" /></span>
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-[#17213e]">Estado actual</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${status.badge}`}>{status.label}</span></div><p className="mt-1 text-xs text-slate-600">{status.description}</p></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-current/10 pt-3 text-xs lg:grid-cols-4">
              <div className="flex min-w-0 gap-2.5"><Icon name="user" className="h-5 w-5 shrink-0 text-slate-500" /><span className="min-w-0 text-slate-500">Creado por<strong className="mt-0.5 block truncate text-[#17213e]" title={creatorName}>{creatorName}</strong></span></div>
              <div className="flex min-w-0 gap-2.5"><Icon name="status" className="h-5 w-5 shrink-0 text-slate-500" /><span className="min-w-0 text-slate-500">Revisado por<strong className="mt-0.5 block truncate text-[#17213e]" title={reviewerName}>{reviewerName}</strong></span></div>
              <div className="flex min-w-0 gap-2.5"><Icon name="calendar" className="h-5 w-5 shrink-0 text-slate-500" /><span className="min-w-0 text-slate-500">Creado<strong className="mt-0.5 block text-[#17213e]">{formatDate(error.created_at)}</strong></span></div>
              <div className="flex min-w-0 gap-2.5"><Icon name="calendar" className="h-5 w-5 shrink-0 text-slate-500" /><span className="min-w-0 text-slate-500">Revisado<strong className="mt-0.5 block text-[#17213e]">{error.reviewed_at ? formatDate(error.reviewed_at) : 'Pendiente'}</strong></span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}