import { useEffect, useRef, useState } from 'react'
import {
  listarJobsVideoGeneracion,
  eliminarJobVideoGeneracion,
  regenerarJobVideoGeneracion,
  cancelarJobVideoGeneracion,
  reintentarEstadoJob,
} from '../api/videoGeneration'
import VideoGenerationFormModal from './VideoGenerationFormModal'
import VideoGenerationStatusBadge from './VideoGenerationStatusBadge'

const POLL_INTERVAL_MS = 8000

export default function VideoTutorialesSection() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [jobParaEditar, setJobParaEditar] = useState(null)
  const [accionEnCurso, setAccionEnCurso] = useState(null) // { id, tipo: 'borrar' | 'regenerar' | 'cancelar' }

  const pollRef = useRef(null)

  async function cargarJobs() {
    setLoading(true)
    setError(null)
    try {
      const data = await listarJobsVideoGeneracion()
      setJobs(data)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los video tutoriales.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarJobs()
  }, [])

  // Auto-refresca las tarjetas que están "procesando" contra Shotstack, para
  // que se vea el cambio de estado sin tener que recargar la página.
  useEffect(() => {
    const enProceso = jobs.filter((j) => j.estado === 'procesando')
    if (enProceso.length === 0) return

    pollRef.current = setInterval(async () => {
      for (const job of enProceso) {
        try {
          const actualizado = await reintentarEstadoJob(job.id)
          setJobs((prev) => prev.map((j) => (j.id === actualizado.id ? actualizado : j)))
        } catch (err) {
          console.error('Error consultando estado del job:', err)
        }
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(pollRef.current)
  }, [jobs])

  function handleGenerarNuevo() {
    setJobParaEditar(null)
    setModalOpen(true)
  }

  function handleEditar(job) {
    setJobParaEditar(job)
    setModalOpen(true)
  }

  function handleCerrarModal() {
    setModalOpen(false)
    setJobParaEditar(null)
    cargarJobs()
  }

  async function handleBorrar(job) {
    const confirmado = window.confirm(
      `¿Eliminar "${job.titulo}"? Esto borra el video generado y no se puede deshacer.`
    )
    if (!confirmado) return

    setAccionEnCurso({ id: job.id, tipo: 'borrar' })
    try {
      await eliminarJobVideoGeneracion(job.id)
      setJobs((prev) => prev.filter((j) => j.id !== job.id))
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el video tutorial.')
    } finally {
      setAccionEnCurso(null)
    }
  }

  async function handleRegenerar(job) {
    const confirmado = window.confirm(
      `¿Regenerar "${job.titulo}"? El video actual (si existe) se va a reemplazar por uno nuevo.`
    )
    if (!confirmado) return

    setAccionEnCurso({ id: job.id, tipo: 'regenerar' })
    setError(null)
    try {
      const actualizado = await regenerarJobVideoGeneracion(job.id)
      setJobs((prev) => prev.map((j) => (j.id === job.id ? actualizado : j)))
    } catch (err) {
      setError(err.message || 'No se pudo regenerar el video tutorial.')
      cargarJobs()
    } finally {
      setAccionEnCurso(null)
    }
  }

  async function handleCancelar(job) {
    setAccionEnCurso({ id: job.id, tipo: 'cancelar' })
    setError(null)
    try {
      const actualizado = await cancelarJobVideoGeneracion(job.id)
      setJobs((prev) => prev.map((j) => (j.id === job.id ? actualizado : j)))
    } catch (err) {
      setError(err.message || 'No se pudo cancelar.')
    } finally {
      setAccionEnCurso(null)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#101a38]">Video Tutoriales</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generá video tutoriales automáticamente a partir de un reporte de error, usando IA.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerarNuevo}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-[#075fe5] to-[#19bfe3] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(21,94,239,.2)] transition hover:brightness-105"
        >
          + Generar Video
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando...</p>}
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      {!loading && jobs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">Todavía no generaste ningún video tutorial.</p>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => {
            const procesando = job.estado === 'procesando'
            const accionActual = accionEnCurso?.id === job.id ? accionEnCurso.tipo : null
            const algunaAccionEnCurso = accionActual !== null

            return (
              <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#17213e]">{job.titulo}</h3>
                  <VideoGenerationStatusBadge estado={job.estado} />
                </div>

                {job.estado === 'completado' && job.video_url && (
                  <video controls className="mt-3 w-full rounded-lg" src={job.video_url} />
                )}

                {procesando && (
                  <p className="mt-3 text-xs text-slate-500">Shotstack está renderizando este video...</p>
                )}

                {(job.estado === 'fallido' || job.estado === 'cancelado') && job.error_mensaje && (
                  <p className="mt-3 text-xs text-red-700">{job.error_mensaje}</p>
                )}

                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  {procesando ? (
                    <button
                      type="button"
                      onClick={() => handleCancelar(job)}
                      disabled={algunaAccionEnCurso}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {accionActual === 'cancelar' ? 'Cancelando...' : 'Cancelar'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleEditar(job)}
                        disabled={algunaAccionEnCurso}
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerar(job)}
                        disabled={algunaAccionEnCurso}
                        className="flex-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                      >
                        {accionActual === 'regenerar' ? 'Regenerando...' : 'Regenerar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBorrar(job)}
                        disabled={algunaAccionEnCurso}
                        className="flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {accionActual === 'borrar' ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <VideoGenerationFormModal
          isOpen={modalOpen}
          onClose={handleCerrarModal}
          onCompletado={cargarJobs}
          jobParaEditar={jobParaEditar}
        />
      )}
    </div>
  )
}