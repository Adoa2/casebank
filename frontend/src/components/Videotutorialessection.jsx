// Sección "Video Tutoriales": trabajos de video con IA, su avance y su publicación en el manual.
// Solo se monta con VITE_VIDEO_IA_HABILITADO=true (ver AdminView y AdminSidebar).
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  avanzarTrabajoVideoIA,
  cancelarTrabajoVideoIA,
  eliminarTrabajoVideoIA,
  listarTrabajosVideoIA,
  obtenerConfiguracionVideosIA,
  publicarTrabajoVideoIA,
  reintentarDescargaVideoIA,
} from '../api/videosIA'
import { obtenerEnlaceVideo } from '../utils/videoEnlace'
import VideoFormModal from './VideoFormModal'
import VideoGenerationFormModal from './VideoGenerationFormModal'
import VideoGenerationStatusBadge from './Videogenerationstatusbadge'

// --- Avance de los trabajos ---
// Cada consulta ejecuta un paso corto en el backend. El trabajo solo avanza
// mientras esta sección está abierta; si nadie lo consulta durante el tiempo
// límite (15 minutos), el backend lo marca como fallido.
const POLL_INTERVAL_MS = 5000
const ESTADOS_ACTIVOS = ['pendiente', 'procesando']
// --- fin avance de los trabajos ---

const TEXTOS_ETAPA = {
  guion: 'Escribiendo el guion...',
  voz: 'Generando la voz...',
  render: 'Componiendo el video...',
  descarga: 'Guardando el video...',
}

function formatearCosto(valor) {
  return valor === null || valor === undefined ? '-' : `USD ${Number(valor).toFixed(2)}`
}

function formatearDuracion(segundos) {
  if (segundos === null || segundos === undefined) return '-'
  const total = Math.round(Number(segundos))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Lista de trabajos con acciones: cancelar, reintentar descarga, publicar, regenerar y eliminar. */
export default function VideoTutorialesSection() {
  const [trabajos, setTrabajos] = useState([])
  const [configuracion, setConfiguracion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [formAbierto, setFormAbierto] = useState(false)
  const [trabajoBase, setTrabajoBase] = useState(null)
  const [trabajoAPublicar, setTrabajoAPublicar] = useState(null)
  const [accionEnCurso, setAccionEnCurso] = useState(null) // { id, tipo }

  const avanzandoRef = useRef(false)

  const reemplazarTrabajo = useCallback((actualizado) => {
    setTrabajos((prev) => prev.map((t) => (t.id === actualizado.id ? actualizado : t)))
  }, [])

  async function cargarTrabajos() {
    setLoading(true)
    setError(null)
    try {
      setTrabajos(await listarTrabajosVideoIA())
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los video tutoriales.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarTrabajos()
    obtenerConfiguracionVideosIA().then(setConfiguracion).catch(() => setConfiguracion(null))
  }, [])

  // Avanza los trabajos activos, de a uno y sin solapar consultas.
  useEffect(() => {
    const activos = trabajos.filter((t) => ESTADOS_ACTIVOS.includes(t.estado))
    if (activos.length === 0) return undefined

    const intervalo = setInterval(async () => {
      if (avanzandoRef.current) return
      avanzandoRef.current = true
      try {
        for (const trabajo of activos) {
          try {
            reemplazarTrabajo(await avanzarTrabajoVideoIA(trabajo.id))
          } catch (err) {
            console.error('Error avanzando el trabajo de video:', err)
          }
        }
      } finally {
        avanzandoRef.current = false
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(intervalo)
  }, [trabajos, reemplazarTrabajo])

  async function ejecutarAccion(trabajo, tipo, accion) {
    setAccionEnCurso({ id: trabajo.id, tipo })
    setError(null)
    try {
      await accion()
    } catch (err) {
      setError(err.message || 'No se pudo completar la acción.')
    } finally {
      setAccionEnCurso(null)
    }
  }

  function handleNuevo() {
    setTrabajoBase(null)
    setFormAbierto(true)
  }

  function handleRegenerar(trabajo) {
    setTrabajoBase(trabajo)
    setFormAbierto(true)
  }

  function handleCreado(trabajo) {
    setTrabajos((prev) => [trabajo, ...prev])
  }

  function handleCancelar(trabajo) {
    return ejecutarAccion(trabajo, 'cancelar', async () => reemplazarTrabajo(await cancelarTrabajoVideoIA(trabajo.id)))
  }

  function handleReintentarDescarga(trabajo) {
    return ejecutarAccion(trabajo, 'descarga', async () => reemplazarTrabajo(await reintentarDescargaVideoIA(trabajo.id)))
  }

  function handleEliminar(trabajo) {
    const aviso = trabajo.video_id
      ? `¿Eliminar "${trabajo.titulo}"? El video ya publicado en el manual no se borra.`
      : `¿Eliminar "${trabajo.titulo}"? Se borra también el video generado y no se puede deshacer.`
    if (!window.confirm(aviso)) return undefined
    return ejecutarAccion(trabajo, 'eliminar', async () => {
      await eliminarTrabajoVideoIA(trabajo.id)
      setTrabajos((prev) => prev.filter((t) => t.id !== trabajo.id))
    })
  }

  // Publicar: crea el video del manual y enlaza el trabajo en una sola transacción.
  async function handlePublicar(datos) {
    const { trabajo } = await publicarTrabajoVideoIA(trabajoAPublicar.id, {
      titulo: datos.titulo,
      seccion_id: datos.seccion_id,
      capitulo: datos.capitulo,
      seccion: datos.seccion,
      subseccion: datos.subseccion,
    })
    reemplazarTrabajo(trabajo)
    setTrabajoAPublicar(null)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#101a38]">Video Tutoriales</h1>
          <p className="mt-1 text-sm text-slate-500">
            Genera video tutoriales con IA a partir de un reporte de error y publícalos en el manual.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNuevo}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-[#075fe5] to-[#19bfe3] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(21,94,239,.2)] transition hover:brightness-105"
        >
          + Generar Video
        </button>
      </div>

      {configuracion && (
        <p className="mb-4 text-xs text-slate-500">
          Límites: {configuracion.max_escenas} escenas, {configuracion.max_caracteres} caracteres,{' '}
          {Math.round(configuracion.max_duracion_segundos / 60)} minutos por video, {configuracion.max_trabajos_por_dia} videos
          por día y uno a la vez. Calidad {configuracion.resolucion}.
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">Cargando...</p>}
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      {!loading && trabajos.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">Todavía no generaste ningún video tutorial.</p>
        </div>
      )}

      {!loading && trabajos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {trabajos.map((trabajo) => {
            const activo = ESTADOS_ACTIVOS.includes(trabajo.estado)
            const accionActual = accionEnCurso?.id === trabajo.id ? accionEnCurso.tipo : null
            const ocupado = accionActual !== null
            const enlace = obtenerEnlaceVideo(trabajo)
            const publicable = trabajo.estado === 'completado' && enlace && !trabajo.video_id

            return (
              <div key={trabajo.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#17213e]">{trabajo.titulo}</h3>
                  <VideoGenerationStatusBadge estado={trabajo.estado} />
                </div>

                {trabajo.estado === 'completado' && enlace && <video controls className="mt-3 w-full rounded-lg" src={enlace} />}

                {activo && (
                  <p className="mt-3 text-xs text-slate-500">{TEXTOS_ETAPA[trabajo.etapa] || 'En cola...'}</p>
                )}

                {trabajo.mensaje_error && trabajo.estado !== 'completado' && (
                  <p className="mt-3 text-xs text-red-700">{trabajo.mensaje_error}</p>
                )}

                <p className="mt-3 text-xs text-slate-500">
                  Duración {formatearDuracion(trabajo.duracion_segundos ?? trabajo.duracion_estimada_segundos)} · Costo estimado{' '}
                  {formatearCosto(trabajo.costo_estimado_usd)}
                  {trabajo.video_id ? ' · Publicado en el manual' : ''}
                </p>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {activo && (
                    <button
                      type="button"
                      onClick={() => handleCancelar(trabajo)}
                      disabled={ocupado}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {accionActual === 'cancelar' ? 'Cancelando...' : 'Cancelar'}
                    </button>
                  )}
                  {trabajo.estado === 'descarga_pendiente' && (
                    <button
                      type="button"
                      onClick={() => handleReintentarDescarga(trabajo)}
                      disabled={ocupado}
                      className="flex-1 rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-50 disabled:opacity-50"
                    >
                      {accionActual === 'descarga' ? 'Reintentando...' : 'Reintentar descarga'}
                    </button>
                  )}
                  {publicable && (
                    <button
                      type="button"
                      onClick={() => setTrabajoAPublicar(trabajo)}
                      disabled={ocupado}
                      className="flex-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Publicar en el manual
                    </button>
                  )}
                  {!activo && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRegenerar(trabajo)}
                        disabled={ocupado}
                        className="flex-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                      >
                        Editar y regenerar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEliminar(trabajo)}
                        disabled={ocupado}
                        className="flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {accionActual === 'eliminar' ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {formAbierto && (
        <VideoGenerationFormModal
          isOpen={formAbierto}
          onClose={() => setFormAbierto(false)}
          onCreado={handleCreado}
          trabajoBase={trabajoBase}
          configuracion={configuracion}
        />
      )}

      {trabajoAPublicar && (
        <VideoFormModal
          mode="publicar"
          initialData={{ titulo: trabajoAPublicar.titulo, enlace: trabajoAPublicar.enlace }}
          onClose={() => setTrabajoAPublicar(null)}
          onSubmit={handlePublicar}
        />
      )}
    </div>
  )
}
