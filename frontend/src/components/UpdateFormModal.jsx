import { useEffect, useState } from 'react'
import hondurasFlag from '../assets/honduras.png'
import dominicanaFlag from '../assets/republica-dominicana.png'
import { fetchManualStructure } from '../api/manual'
import { buildJerarquiaAnidada } from '../utils/manualTree'

const OTHER = '__otros__'
const applicabilityOptions = [
  { value: 'honduras', label: 'Honduras', flags: [hondurasFlag] },
  { value: 'dominicana', label: 'República Dominicana', flags: [dominicanaFlag] },
  { value: 'ambas', label: 'Ambas', flags: [hondurasFlag, dominicanaFlag] },
]

function descendants(node) {
  return node.hijos.flatMap((child) => [child, ...descendants(child)])
}

export default function UpdateFormModal({ initialData, onClose, onSubmit }) {
  const editing = Boolean(initialData)
  const [form, setForm] = useState({
    titulo: initialData?.titulo || '', descripcion: initialData?.descripcion || '',
    palabras_clave: initialData?.palabras_clave || '', aplicabilidad: initialData?.aplicabilidad || 'ambas',
    is_active: initialData?.is_active ?? true,
  })
  const [file, setFile] = useState(null)
  const [tree, setTree] = useState([])
  const [loadingTree, setLoadingTree] = useState(true)
  const [treeError, setTreeError] = useState('')
  const [chapterChoice, setChapterChoice] = useState('')
  const [sectionChoice, setSectionChoice] = useState('')
  const [otherChapter, setOtherChapter] = useState('')
  const [otherSection, setOtherSection] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchManualStructure()
      .then((data) => { if (!cancelled) setTree(buildJerarquiaAnidada(data)) })
      .catch((err) => { if (!cancelled) setTreeError(err.message || 'No se pudo cargar la estructura del manual.') })
      .finally(() => { if (!cancelled) setLoadingTree(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!editing || !tree.length) return
    let chapter = tree.find((item) => item.titulo === initialData?.capitulo)
    if (!chapter && initialData?.seccion_id) chapter = tree.find((item) => descendants(item).some((child) => child.id === initialData.seccion_id))
    if (!chapter) {
      setChapterChoice(OTHER); setOtherChapter(initialData?.capitulo || '')
      setSectionChoice(OTHER); setOtherSection(initialData?.seccion || '')
      return
    }
    setChapterChoice(String(chapter.id))
    const section = chapter.hijos.find((item) => item.id === initialData?.seccion_id || item.titulo === initialData?.seccion || descendants(item).some((child) => child.id === initialData?.seccion_id))
    if (section) setSectionChoice(String(section.id))
    else { setSectionChoice(OTHER); setOtherSection(initialData?.seccion || '') }
  }, [editing, initialData, tree])

  const selectedChapter = tree.find((item) => String(item.id) === chapterChoice)
  const sections = selectedChapter?.hijos || []
  const inputClass = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100'

  function change(event) {
    const { name, value, type, checked } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  function changeChapter(value) {
    setChapterChoice(value); setSectionChoice(value === OTHER ? OTHER : '')
    setOtherChapter(''); setOtherSection(''); setError('')
  }

  async function submit(event) {
    event.preventDefault()
    if (!editing && !file) return setError('Selecciona el documento PDF que deseas publicar.')
    if (!chapterChoice) return setError('Selecciona el capítulo al que pertenece la actualización.')
    if (chapterChoice === OTHER && !otherChapter.trim()) return setError('Escribe el nombre del nuevo capítulo.')
    if (!sectionChoice) return setError('Selecciona la sección a la que pertenece la actualización.')
    if (sectionChoice === OTHER && !otherSection.trim()) return setError('Escribe el nombre de la nueva sección.')
    if (file && (file.type !== 'application/pdf' || file.size > 15 * 1024 * 1024)) return setError('El archivo debe ser un PDF de máximo 15 MB.')
    const selectedSection = sections.find((item) => String(item.id) === sectionChoice)
    setSaving(true); setError('')
    try {
      await onSubmit({
        ...form, file,
        seccion_id: sectionChoice === OTHER ? null : Number(sectionChoice),
        capitulo: chapterChoice === OTHER ? otherChapter.trim() : selectedChapter.titulo,
        seccion: sectionChoice === OTHER ? otherSection.trim() : selectedSection.titulo,
        subseccion: null,
      })
    } catch (err) { setError(err.message || 'No se pudo guardar la actualización.') } finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true">
    <form onSubmit={submit} className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-5 sm:px-7"><div><h2 className="text-xl font-bold text-[#101a38]">{editing ? 'Editar actualización' : 'Nueva actualización'}</h2><p className="mt-1 text-sm text-slate-500">El contenido del PDF estará disponible para Casey según el país seleccionado.</p></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
      <div className="space-y-5 px-5 py-6 sm:px-7">
        {(error || treeError) && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error || treeError}</p>}
        <label className="block"><span className="mb-2 block text-sm font-semibold text-[#17213e]">Título *</span><input required minLength={3} name="titulo" value={form.titulo} onChange={change} placeholder="Ej. Nueva opción para desembolsos" className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
        <label className="block"><span className="mb-2 block text-sm font-semibold text-[#17213e]">Descripción *</span><textarea required minLength={5} name="descripcion" value={form.descripcion} onChange={change} rows={3} placeholder="Resume qué cambió y para qué sirve." className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
        <label className="block"><span className="mb-2 block text-sm font-semibold text-[#17213e]">Palabras clave *</span><input required name="palabras_clave" value={form.palabras_clave} onChange={change} placeholder="desembolso, préstamo, aprobación" className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /><small className="mt-1.5 block text-xs text-slate-500">Sepáralas con comas. Casey las utilizará para encontrar mejor el contenido.</small></label>
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5"><div className="mb-4"><h3 className="text-sm font-semibold text-[#17213e]">Ubicación en el manual</h3><p className="mt-1 text-xs text-slate-500">Selecciona el capítulo y la sección, o utiliza “Otros” si son nuevos.</p></div><div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-2 block text-xs font-semibold text-[#17213e]">Capítulo *</label><select value={chapterChoice} onChange={(event) => changeChapter(event.target.value)} disabled={loadingTree} className={inputClass}><option value="">{loadingTree ? 'Cargando...' : 'Selecciona un capítulo'}</option>{tree.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.titulo}</option>)}<option value={OTHER}>Otros</option></select>{chapterChoice === OTHER && <input value={otherChapter} onChange={(event) => setOtherChapter(event.target.value)} placeholder="Nombre del nuevo capítulo" className={`${inputClass} mt-3`} />}</div>
          <div><label className="mb-2 block text-xs font-semibold text-[#17213e]">Sección *</label><select value={sectionChoice} onChange={(event) => { setSectionChoice(event.target.value); setOtherSection(''); setError('') }} disabled={!chapterChoice} className={inputClass}><option value="">{chapterChoice ? 'Selecciona una sección' : 'Primero elige un capítulo'}</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.titulo}</option>)}<option value={OTHER}>Otros</option></select>{sectionChoice === OTHER && <input value={otherSection} onChange={(event) => setOtherSection(event.target.value)} placeholder="Nombre de la nueva sección" className={`${inputClass} mt-3`} />}</div>
        </div></div>
        <fieldset><legend className="mb-2 text-sm font-semibold text-[#17213e]">¿A qué cooperativas aplica? *</legend><div className="grid gap-3 sm:grid-cols-3">{applicabilityOptions.map((option) => <label key={option.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition ${form.aplicabilidad === option.value ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-200'}`}><input type="radio" name="aplicabilidad" value={option.value} checked={form.aplicabilidad === option.value} onChange={change} className="accent-blue-600" /><span className="flex -space-x-1">{option.flags.map((flag) => <img key={flag} src={flag} className="h-7 w-9 rounded object-cover ring-2 ring-white" alt="" />)}</span><span className="text-sm font-medium text-[#17213e]">{option.label}</span></label>)}</div></fieldset>
        <label className="block rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-5 text-center transition hover:bg-blue-50"><input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} className="sr-only" /><svg className="mx-auto h-9 w-9 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M4 15v4h16v-4" /></svg><strong className="mt-2 block text-sm text-blue-700">{file?.name || (editing ? 'Reemplazar PDF (opcional)' : 'Seleccionar documento PDF *')}</strong><span className="mt-1 block text-xs text-slate-500">Máximo 15 MB y con texto seleccionable.</span></label>
        <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3"><span><strong className="block text-sm text-[#17213e]">Disponible para Casey</strong><small className="text-xs text-slate-500">Al desactivarlo, no aparecerá en las respuestas.</small></span><input type="checkbox" name="is_active" checked={form.is_active} onChange={change} className="h-5 w-5 accent-blue-600" /></label>
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-7"><button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button><button disabled={saving || loadingTree || Boolean(treeError)} className="rounded-xl bg-gradient-to-r from-[#075fe5] to-[#19c9dd] px-6 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-60">{saving ? 'Procesando PDF...' : 'Guardar actualización'}</button></footer>
    </form>
  </div>
}
