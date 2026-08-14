import { useEffect, useMemo, useState } from 'react'
import { listVideos, createVideo, updateVideo, deleteVideo } from '../api/videos'
import VideoFormModal from './VideoFormModal'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '-'
  }
}

export default function VideosSection() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState(null) // null | 'create' | 'edit'
  const [editingVideo, setEditingVideo] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function loadVideos() {
    setLoading(true)
    setError(null)
    try {
      const data = await listVideos()
      setVideos(data)
    } catch (err) {
      setError(err.message || 'No se pudo cargar la lista de videos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVideos()
  }, [])

  const filteredVideos = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return videos
    return videos.filter(
      (v) => v.titulo.toLowerCase().includes(q) || v.capitulo.toLowerCase().includes(q)
    )
  }, [videos, search])

  function openCreate() {
    setEditingVideo(null)
    setModalMode('create')
  }

  function openEdit(video) {
    setEditingVideo(video)
    setModalMode('edit')
  }

  function closeModal() {
    setModalMode(null)
    setEditingVideo(null)
  }

  async function handleSubmit(payload) {
    if (modalMode === 'edit') {
      const updated = await updateVideo(editingVideo.id, payload)
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
    } else {
      const created = await createVideo(payload)
      setVideos((prev) => [created, ...prev])
    }
    closeModal()
  }

  async function handleDelete(video) {
    if (!window.confirm(`¿Eliminar el video "${video.titulo}"? Esta acción no se puede deshacer.`)) {
      return
    }
    setActionError(null)
    setBusyId(video.id)
    try {
      await deleteVideo(video.id)
      setVideos((prev) => prev.filter((v) => v.id !== video.id))
    } catch (err) {
      setActionError(err.message || 'No se pudo eliminar el video.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Administrar Videos</h1>
          <p className="text-sm text-slate">Videos formativos vinculados a secciones del manual</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
        >
          + Nuevo Video
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o capítulo..."
          className="w-full max-w-sm rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        />
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-blue-50/60 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Título</th>
              <th className="px-4 py-3 font-medium">Capítulo</th>
              <th className="px-4 py-3 font-medium">Sección / Subsección</th>
              <th className="px-4 py-3 font-medium">Creado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Cargando videos...
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

            {!loading && !error && filteredVideos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No se encontraron videos.
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              filteredVideos.map((v) => {
                const busy = busyId === v.id
                return (
                  <tr key={v.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-slate-900">{v.titulo}</td>
                    <td className="px-4 py-3 text-slate-600">{v.capitulo}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {v.seccion}
                      {v.subseccion ? ` › ${v.subseccion}` : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(v.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(v)}
                          title="Editar"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-blue"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19 3 20l1-4Z" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(v)}
                          disabled={busy}
                          title="Eliminar"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-brand-red disabled:opacity-30"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {modalMode && (
        <VideoFormModal
          mode={modalMode}
          initialData={editingVideo}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}