import { useEffect, useMemo, useState } from 'react'
import { listVideos, createVideo, updateVideo, deleteVideo } from '../api/videos'
import VideoFormModal from './VideoFormModal'

const VIDEO_COLORS = [
  'linear-gradient(135deg, #2563eb, #22d3ee)',
  'linear-gradient(135deg, #7c3aed, #e879f9)',
  'linear-gradient(135deg, #059669, #2dd4bf)',
  'linear-gradient(135deg, #ea580c, #fbbf24)',
]

function formatDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '-'
  }
}

function colorForVideo(video) {
  const seed = [...(video.titulo || '')].reduce((total, character) => total + character.charCodeAt(0), 0)
  return VIDEO_COLORS[seed % VIDEO_COLORS.length]
}

function VideoIcon({ video, compact = false }) {
  return (
    <span style={{ background: colorForVideo(video), backgroundColor: '#2563eb' }} className={`grid shrink-0 place-items-center rounded-xl text-white shadow-sm ring-1 ring-black/5 ${compact ? 'h-10 w-10' : 'h-12 w-12'}`}>
      <svg className={compact ? 'h-5 w-5' : 'h-6 w-6'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3Z" /></svg>
    </span>
  )
}

function Actions({ video, busy, onEdit, onDelete }) {
  const buttonClass = 'grid h-9 w-9 place-items-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-30'
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={() => onEdit(video)} title="Editar video" aria-label={`Editar ${video.titulo}`} className={`${buttonClass} border-blue-100 bg-blue-50/70 text-blue-600 hover:bg-blue-100`}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19 3 20l1-4Z" /></svg>
      </button>
      <button type="button" onClick={() => onDelete(video)} disabled={busy} title="Eliminar video" aria-label={`Eliminar ${video.titulo}`} className={`${buttonClass} border-red-100 bg-red-50/70 text-red-500 hover:bg-red-100`}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>
      </button>
    </div>
  )
}

function ChapterBadge({ children }) {
  return <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-100"><svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4.5A3.5 3.5 0 0 1 7.5 3H11v17H7.5A3.5 3.5 0 0 0 4 21.5v-17ZM20 4.5A3.5 3.5 0 0 0 16.5 3H13v17h3.5a3.5 3.5 0 0 1 3.5 1.5v-17Z" /></svg><span className="truncate">{children}</span></span>
}

export default function VideosSection() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState(null)
  const [editingVideo, setEditingVideo] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function loadVideos() {
    setLoading(true)
    setError(null)
    try {
      setVideos(await listVideos())
    } catch (err) {
      setError(err.message || 'No se pudo cargar la lista de videos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadVideos() }, [])

  const filteredVideos = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return videos
    return videos.filter((video) => [video.titulo, video.capitulo, video.seccion, video.subseccion].some((value) => value?.toLowerCase().includes(query)))
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
      setVideos((previous) => previous.map((video) => (video.id === updated.id ? updated : video)))
    } else {
      const created = await createVideo(payload)
      setVideos((previous) => [created, ...previous])
    }
    closeModal()
  }

  async function handleDelete(video) {
    if (!window.confirm(`¿Eliminar el video "${video.titulo}"? Esta acción no se puede deshacer.`)) return
    setActionError(null)
    setBusyId(video.id)
    try {
      await deleteVideo(video.id)
      setVideos((previous) => previous.filter((item) => item.id !== video.id))
    } catch (err) {
      setActionError(err.message || 'No se pudo eliminar el video.')
    } finally {
      setBusyId(null)
    }
  }

  const feedback = loading ? 'Cargando videos...' : error || (filteredVideos.length === 0 ? 'No se encontraron videos.' : null)

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-50 to-cyan-50 text-emerald-600 shadow-sm ring-1 ring-emerald-100 sm:h-16 sm:w-16">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3Z" /></svg>
          </span>
          <div><h1 className="text-2xl font-bold tracking-tight text-[#0b1739] sm:text-[28px]">Administrar Videos</h1><p className="mt-1 text-sm text-slate-500 sm:text-base">Gestiona los videos formativos vinculados al manual.</p></div>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#075fe5] to-[#19c9dd] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(21,94,239,.2)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-blue-300 sm:w-auto">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>Nuevo Video
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(30,55,90,.08)] sm:p-5">
        <label className="relative block w-full lg:max-w-[520px]"><span className="sr-only">Buscar videos</span><svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, capítulo o sección..." className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
      </div>

      {actionError && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(30,55,90,.08)]">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold uppercase tracking-wide text-slate-600"><tr><th className="w-[25%] px-6 py-5">Video</th><th className="w-[23%] px-5 py-5">Capítulo</th><th className="w-[29%] px-5 py-5">Sección / Subsección</th><th className="w-[13%] px-5 py-5">Creado</th><th className="w-[10%] px-5 py-5 text-right">Acciones</th></tr></thead>
            <tbody>
              {feedback && <tr><td colSpan={5} className={`px-6 py-16 text-center ${error ? 'text-red-600' : 'text-slate-400'}`}>{feedback}</td></tr>}
              {!feedback && filteredVideos.map((video) => <tr key={video.id} className="border-b border-slate-200 last:border-0 transition hover:bg-slate-50/50">
                <td className="px-6 py-5"><div className="flex min-w-0 items-center gap-3"><VideoIcon video={video} /><div className="min-w-0"><strong className="block truncate text-[#101a38]" title={video.titulo}>{video.titulo}</strong><a href={video.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">Ver video <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6H5V6h6" /></svg></a></div></div></td>
                <td className="px-5 py-5"><ChapterBadge>{video.capitulo}</ChapterBadge></td>
                <td className="px-5 py-5"><div className="flex min-w-0 items-start gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7h7l2 2h9v10H3z" /></svg></span><span className="min-w-0"><strong className="block truncate text-sm font-medium text-[#17213e]" title={video.seccion}>{video.seccion || 'Sección general'}</strong>{video.subseccion && <small className="mt-1 block truncate text-xs text-slate-500" title={video.subseccion}>{video.subseccion}</small>}</span></div></td>
                <td className="px-5 py-5"><span className="inline-flex items-center gap-2 text-[#17213e]"><svg className="h-5 w-5 shrink-0 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></svg>{formatDate(video.created_at)}</span></td>
                <td className="px-5 py-5"><Actions video={video} busy={busyId === video.id} onEdit={openEdit} onDelete={handleDelete} /></td>
              </tr>)}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-200 md:hidden">
          {feedback && <p className={`px-5 py-14 text-center text-sm ${error ? 'text-red-600' : 'text-slate-400'}`}>{feedback}</p>}
          {!feedback && filteredVideos.map((video) => <article key={video.id} className="p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-3"><VideoIcon video={video} /><div className="min-w-0 flex-1"><h2 className="break-words font-semibold text-[#101a38]">{video.titulo}</h2><a href={video.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600">Ver video</a></div></div>
            <div className="mt-4"><ChapterBadge>{video.capitulo}</ChapterBadge></div>
            <div className="mt-4 rounded-xl bg-emerald-50/60 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Sección</p><p className="mt-1 text-sm font-medium text-[#17213e]">{video.seccion || 'Sección general'}</p>{video.subseccion && <p className="mt-1 text-xs leading-5 text-slate-500">{video.subseccion}</p>}</div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="flex items-center gap-2 text-xs text-slate-500"><svg className="h-4 w-4 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></svg>{formatDate(video.created_at)}</span><Actions video={video} busy={busyId === video.id} onEdit={openEdit} onDelete={handleDelete} /></div>
          </article>)}
        </div>

        {!feedback && <div className="border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:px-6">Mostrando <strong className="text-[#17213e]">{filteredVideos.length}</strong> de <strong className="text-[#17213e]">{videos.length}</strong> videos</div>}
      </div>

      {modalMode && <VideoFormModal mode={modalMode} initialData={editingVideo} onClose={closeModal} onSubmit={handleSubmit} />}
    </section>
  )
}
