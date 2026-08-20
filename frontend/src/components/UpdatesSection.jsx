import { useEffect, useMemo, useState } from 'react'
import { createUpdate, deleteUpdate, listUpdates, replaceUpdatePdf, updateUpdate } from '../api/updates'
import hondurasFlag from '../assets/honduras.png'
import dominicanaFlag from '../assets/republica-dominicana.png'
import UpdateFormModal from './UpdateFormModal'

const flags = { honduras: [hondurasFlag], dominicana: [dominicanaFlag], ambas: [hondurasFlag, dominicanaFlag] }
const labels = { honduras: 'Honduras', dominicana: 'R. Dominicana', ambas: 'Ambas' }

function Country({ value }) {
  return <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"><span className="flex -space-x-1">{(flags[value] || []).map((flag) => <img key={flag} src={flag} alt="" className="h-5 w-7 rounded-sm object-cover ring-1 ring-white" />)}</span>{labels[value] || value}</span>
}

const formatDate = (value) => value ? new Date(value).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'

export default function UpdatesSection() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(undefined)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { listUpdates().then(setItems).catch((err) => setError(err.message)).finally(() => setLoading(false)) }, [])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? items.filter((item) => [item.titulo, item.descripcion, item.palabras_clave].some((value) => value?.toLowerCase().includes(query))) : items
  }, [items, search])

  async function save(payload) {
    const { file, ...metadata } = payload
    if (editing) {
      let saved = await updateUpdate(editing.id, metadata)
      if (file) saved = await replaceUpdatePdf(editing.id, file)
      setItems((current) => current.map((item) => item.id === saved.id ? saved : item))
    } else {
      const saved = await createUpdate({ ...metadata, file })
      setItems((current) => [saved, ...current])
    }
    setEditing(undefined)
  }

  async function remove(item) {
    if (!window.confirm(`¿Eliminar la actualización "${item.titulo}" y su PDF?`)) return
    setBusyId(item.id); setError('')
    try { await deleteUpdate(item.id); setItems((current) => current.filter((value) => value.id !== item.id)) } catch (err) { setError(err.message) } finally { setBusyId(null) }
  }

  return <section className="flex flex-1 flex-col">
    <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-600 ring-1 ring-blue-100 sm:h-16 sm:w-16"><svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 12h6m-6 4h6" /></svg></span><div><h1 className="text-2xl font-bold text-[#0b1739] sm:text-[28px]">Actualizaciones del manual</h1><p className="mt-1 text-sm text-slate-500 sm:text-base">Publica PDF para que Casey responda con la información más reciente.</p></div></div>
      <button type="button" onClick={() => setEditing(null)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#075fe5] to-[#19c9dd] px-5 py-3.5 text-sm font-semibold text-white shadow-lg"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>Nueva actualización</button>
    </div>
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label className="relative block max-w-xl"><svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, descripción o palabras clave..." className="h-12 w-full rounded-xl border border-slate-200 pl-12 pr-4 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label></div>
    {error && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-6 py-4">Documento</th><th className="px-5 py-4">Palabras clave</th><th className="px-5 py-4">Aplica a</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4">Creado</th><th className="px-5 py-4 text-right">Acciones</th></tr></thead><tbody>
        {loading && <tr><td colSpan="6" className="py-16 text-center text-slate-400">Cargando actualizaciones...</td></tr>}
        {!loading && !filtered.length && <tr><td colSpan="6" className="py-16 text-center text-slate-400">No se encontraron actualizaciones.</td></tr>}
        {filtered.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"><td className="max-w-[330px] px-6 py-5"><div className="flex gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><strong className="text-xs">PDF</strong></span><span className="min-w-0"><strong className="block truncate text-[#101a38]">{item.titulo}</strong><span className="mt-1 block truncate text-xs text-slate-500">{item.descripcion}</span>{item.capitulo && <span className="mt-1 block truncate text-[11px] font-medium text-violet-600">{item.capitulo} · {item.subseccion || item.seccion}</span>}<a href={item.archivo_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-blue-600 hover:underline">Abrir PDF</a></span></div></td><td className="max-w-[250px] px-5 py-5"><span className="line-clamp-2 text-xs leading-5 text-slate-600">{item.palabras_clave}</span></td><td className="px-5 py-5"><Country value={item.aplicabilidad} /></td><td className="px-5 py-5"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><i className={`h-2 w-2 rounded-full ${item.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />{item.is_active ? 'Disponible' : 'Oculto'}</span></td><td className="px-5 py-5 text-slate-600">{formatDate(item.created_at)}</td><td className="px-5 py-5"><div className="flex justify-end gap-2"><button onClick={() => setEditing(item)} className="grid h-9 w-9 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600" aria-label="Editar"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16.5 3.5a2 2 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button><button disabled={busyId === item.id} onClick={() => remove(item)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-100 bg-red-50 text-red-500 disabled:opacity-40" aria-label="Eliminar"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" /></svg></button></div></td></tr>)}
      </tbody></table></div>
      <div className="divide-y divide-slate-100 md:hidden">{!loading && filtered.map((item) => <article key={item.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-[#101a38]">{item.titulo}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{item.descripcion}</p>{item.capitulo && <p className="mt-2 text-xs font-medium text-violet-600">{item.capitulo} · {item.subseccion || item.seccion}</p>}</div><span className="rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-600">PDF</span></div><div className="mt-4 flex flex-wrap items-center gap-2"><Country value={item.aplicabilidad} /><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.is_active ? 'Disponible' : 'Oculto'}</span></div><p className="mt-3 text-xs leading-5 text-slate-500">{item.palabras_clave}</p><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><a href={item.archivo_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600">Abrir PDF</a><div className="flex gap-2"><button onClick={() => setEditing(item)} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600">Editar</button><button onClick={() => remove(item)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-500">Eliminar</button></div></div></article>)}</div>
      {!loading && <div className="border-t border-slate-200 px-6 py-4 text-sm text-slate-500">Mostrando <strong>{filtered.length}</strong> de <strong>{items.length}</strong> actualizaciones</div>}
    </div>
    {editing !== undefined && <UpdateFormModal initialData={editing} onClose={() => setEditing(undefined)} onSubmit={save} />}
  </section>
}
