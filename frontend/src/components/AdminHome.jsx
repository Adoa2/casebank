import { useEffect, useMemo, useState } from 'react'
import { listUsers } from '../api/adminUsers'
import { listErrors } from '../api/errors'
import { listVideos } from '../api/videos'
import { getUsername } from '../api/authToken'

const CARD_STYLES = {
  users: { icon: 'bg-blue-50 text-blue-600', line: '#3b82f6' },
  videos: { icon: 'bg-emerald-50 text-emerald-600', line: '#10b981' },
  solved: { icon: 'bg-purple-50 text-purple-600', line: '#8b5cf6' },
  pending: { icon: 'bg-amber-50 text-amber-600', line: '#f59e0b' },
}

function Icon({ name, className = 'h-6 w-6' }) {
  const paths = {
    users: <><circle cx="9" cy="7" r="3" /><path d="M3.5 20v-2c0-3 2.1-5 5.5-5s5.5 2 5.5 5v2M16 4.5a3 3 0 0 1 0 5.8M16.5 13c2.7.2 4 2 4 4.5V20" /></>,
    video: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3Z" /></>,
    solved: <><path d="M12 2.8 19 6v5.2c0 4.5-2.8 8-7 9.8-4.2-1.8-7-5.3-7-9.8V6l7-3.2Z" /><path d="m9 12 2 2 4-4" /></>,
    pending: <><path d="M10.3 3.7 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    manual: <><path d="M4 4.5A3.5 3.5 0 0 1 7.5 3H11v17H7.5A3.5 3.5 0 0 0 4 21.5v-17ZM20 4.5A3.5 3.5 0 0 0 16.5 3H13v17h3.5a3.5 3.5 0 0 1 3.5 1.5v-17Z" /></>,
    arrow: <path d="m9 18 6-6-6-6" />,
  }
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function HeroArtwork() {
  return (
    <svg className="h-full w-full" viewBox="0 0 420 170" fill="none" aria-hidden="true">
      <path d="M34 149c27-7 37-31 25-52 29 2 45 16 48 42 11-31 33-43 64-36-12 17-13 32-2 46H34Z" fill="#B8F0DD" />
      <rect x="102" y="55" width="180" height="100" rx="14" fill="white" stroke="#DFE9F7" />
      <circle cx="122" cy="76" r="4" fill="#85C7F8" /><path d="M137 76h28M117 98h48M117 119h35M117 140h42" stroke="#D9E6F7" strokeWidth="7" strokeLinecap="round" />
      <rect x="170" y="20" width="154" height="120" rx="14" fill="white" stroke="#DFE9F7" />
      <circle cx="188" cy="35" r="4" fill="#D96BEA" /><circle cx="201" cy="35" r="4" fill="#65DAB1" /><circle cx="214" cy="35" r="4" fill="#8BD8D4" />
      <path d="m190 103 22-25 20 10 25-30 24 14 23-25" stroke="#3281F7" strokeWidth="2.5" /><circle cx="304" cy="47" r="5" fill="#3281F7" />
      <rect x="187" y="117" width="32" height="7" rx="3.5" fill="#E3ECF8" /><rect x="230" y="117" width="28" height="7" rx="3.5" fill="#E3ECF8" /><rect x="270" y="117" width="35" height="7" rx="3.5" fill="#E3ECF8" />
      <rect x="322" y="32" width="82" height="123" rx="14" fill="white" stroke="#DFE9F7" />
      <circle cx="362" cy="87" r="27" stroke="#61D6C1" strokeWidth="13" /><path d="M362 60a27 27 0 0 1 24 15" stroke="#327FF5" strokeWidth="13" />
      <path d="M341 132h42" stroke="#DDE8F5" strokeWidth="7" strokeLinecap="round" />
    </svg>
  )
}

function StatCard({ type, label, value, restricted }) {
  const style = CARD_STYLES[type]
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_7px_22px_rgba(30,55,90,.06)]">
      <div className="flex items-start gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${style.icon}`}><Icon name={type === 'solved' ? 'solved' : type === 'pending' ? 'pending' : type === 'videos' ? 'video' : 'users'} /></span>
        <div><p className="text-xs font-semibold text-slate-600">{label}</p><p className="mt-1 text-3xl font-bold tracking-tight text-[#101a38]">{restricted ? '—' : value}</p></div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{restricted ? 'Requiere privilegio mayor' : 'Total actual del sistema'}</span><svg className="h-6 w-20" viewBox="0 0 80 24"><path d="M1 19c8-1 10-12 18-8s9 9 17 3 12-8 19-3 12 8 24-5" fill="none" stroke={style.line} strokeWidth="1.5" /></svg></div>
    </article>
  )
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AdminHome({ role, onNavigate, onGoManual }) {
  const [data, setData] = useState({ users: [], videos: [], errors: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const privileged = role >= 2
  const username = getUsername() || 'Administrador'

  useEffect(() => {
    let active = true
    async function loadDashboard() {
      setLoading(true)
      setLoadError(null)
      try {
        const [errors, users, videos] = await Promise.all([
          listErrors(),
          privileged ? listUsers() : Promise.resolve([]),
          privileged ? listVideos() : Promise.resolve([]),
        ])
        if (active) setData({ errors, users, videos })
      } catch (error) {
        if (active) setLoadError(error.message || 'No se pudo cargar el resumen administrativo.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadDashboard()
    return () => { active = false }
  }, [privileged])

  const activities = useMemo(() => {
    const entries = [
      ...data.users.map((user) => ({ id: `user-${user.id}`, type: 'users', title: 'Se registró un nuevo usuario', detail: user.username, date: user.created_at })),
      ...data.videos.map((video) => ({ id: `video-${video.id}`, type: 'videos', title: 'Se publicó un video', detail: video.titulo, date: video.created_at })),
      ...data.errors.map((item) => ({ id: `error-${item.id}`, type: item.estado === 'pendiente' ? 'pending' : 'solved', title: item.estado === 'pendiente' ? 'Error pendiente de revisión' : `Error ${item.estado}`, detail: item.titulo, date: item.reviewed_at || item.created_at })),
    ]
    return entries.filter((entry) => entry.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4)
  }, [data])

  const solved = data.errors.filter((item) => item.estado !== 'pendiente').length
  const pending = data.errors.filter((item) => item.estado === 'pendiente').length
  const quickActions = [
    { label: 'Gestionar usuarios', description: 'Crear y administrar cuentas.', icon: 'users', section: 'usuarios', locked: !privileged, style: 'bg-blue-50 text-blue-600' },
    { label: 'Administrar videos', description: 'Publicar contenido formativo.', icon: 'video', section: 'videos', locked: !privileged, style: 'bg-emerald-50 text-emerald-600' },
    { label: 'Ver errores', description: 'Revisar errores frecuentes.', icon: 'solved', section: 'errores-frecuentes', style: 'bg-purple-50 text-purple-600' },
    { label: 'Abrir el manual', description: 'Volver al contenido principal.', icon: 'manual', action: onGoManual, style: 'bg-amber-50 text-amber-600' },
  ]

  return (
    <section className="flex flex-1 flex-col">
      <div className="relative mb-7 min-h-[180px] overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-[#f8fbff] via-[#f3f8ff] to-[#edf7ff] px-6 py-8 sm:px-9 lg:flex lg:items-center lg:justify-between">
        <div className="relative z-10 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600">Panel administrativo</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0b1739] sm:text-3xl">¡Bienvenido de vuelta, {username}! <span aria-hidden="true">👋</span></h1><p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Desde aquí puedes gestionar los usuarios, videos y el contenido de CaseBank.</p></div>
        <div className="absolute -bottom-3 right-3 hidden h-[170px] w-[420px] lg:block"><HeroArtwork /></div>
      </div>

      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-[#101a38]">Resumen general</h2><span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500">Datos actuales</span></div>
      {loadError && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard type="users" label="Usuarios registrados" value={loading ? '...' : data.users.length} restricted={!privileged} />
        <StatCard type="videos" label="Videos publicados" value={loading ? '...' : data.videos.length} restricted={!privileged} />
        <StatCard type="solved" label="Errores resueltos" value={loading ? '...' : solved} />
        <StatCard type="pending" label="Errores pendientes" value={loading ? '...' : pending} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.08fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_7px_22px_rgba(30,55,90,.06)]"><h2 className="text-lg font-bold text-[#101a38]">Accesos rápidos</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{quickActions.map((action) => <button key={action.label} type="button" disabled={action.locked} onClick={() => action.action ? action.action() : onNavigate(action.section)} className="group flex min-h-[160px] flex-col items-center rounded-xl border border-slate-200 p-4 text-center transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45"><span className={`grid h-12 w-12 place-items-center rounded-xl ${action.style}`}><Icon name={action.icon} /></span><strong className="mt-4 text-sm text-[#101a38]">{action.label}</strong><span className="mt-2 text-xs leading-5 text-slate-500">{action.locked ? 'Requiere privilegio mayor.' : action.description}</span></button>)}</div></section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_7px_22px_rgba(30,55,90,.06)]"><h2 className="px-5 pb-3 pt-5 text-lg font-bold text-[#101a38]">Actividad reciente</h2><div className="divide-y divide-slate-100">{loading ? <p className="px-5 py-10 text-center text-sm text-slate-400">Cargando actividad...</p> : activities.length ? activities.map((activity) => { const style = CARD_STYLES[activity.type]; return <div key={activity.id} className="flex items-center gap-3 px-5 py-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${style.icon}`}><Icon name={activity.type === 'videos' ? 'video' : activity.type === 'users' ? 'users' : activity.type === 'pending' ? 'pending' : 'solved'} className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#17213e]">{activity.title}</p><p className="truncate text-xs text-slate-500">{activity.detail}</p></div><time className="shrink-0 text-xs text-slate-400">{formatDate(activity.date)}</time></div> }) : <p className="px-5 py-10 text-center text-sm text-slate-400">No hay actividad reciente.</p>}</div><button type="button" onClick={() => onNavigate('errores-frecuentes')} className="flex w-full items-center gap-2 border-t border-slate-100 px-5 py-3 text-left text-sm font-semibold text-blue-600 hover:bg-blue-50">Ver los errores <Icon name="arrow" className="h-4 w-4" /></button></section>
      </div>
    </section>
  )
}
