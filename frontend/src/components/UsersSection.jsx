import { useEffect, useMemo, useState } from 'react'
import { listUsers, createUser, updateUser, deleteUser } from '../api/adminUsers'
import { getUsername } from '../api/authToken'
import UserFormModal from './UserFormModal'
import hondurasFlag from '../assets/honduras.png'
import dominicanRepublicFlag from '../assets/republica-dominicana.png'

const PAGE_SIZE = 8

const ROLE_LABELS = { 0: 'Usuario', 1: 'Administrador', 2: 'Privilegio mayor' }
const ROLE_BADGE = {
  0: 'bg-slate-100 text-slate-700',
  1: 'bg-blue-50 text-blue-700',
  2: 'bg-purple-50 text-purple-700',
}
const AVATAR_STYLES = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-cyan-100 text-cyan-700',
  'bg-amber-100 text-amber-700',
]

function formatDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '-'
  }
}

function avatarStyle(username = '') {
  const seed = [...username].reduce((total, char) => total + char.charCodeAt(0), 0)
  return AVATAR_STYLES[seed % AVATAR_STYLES.length]
}

function UserAvatar({ username }) {
  return (
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-base font-bold uppercase ${avatarStyle(username)}`}>
      {username?.trim()?.[0] || '?'}
    </span>
  )
}

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium ${ROLE_BADGE[role] || ROLE_BADGE[0]}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function StatusBadge({ active }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-red-500'}`} />
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}

const NATIONALITY_DATA = {
  hondurena: { flag: hondurasFlag, label: 'Hondureña' },
  dominicana: { flag: dominicanRepublicFlag, label: 'Dominicana' },
}

function NationalityBadge({ nationality }) {
  const data = NATIONALITY_DATA[nationality]
  if (!data) return <span className="text-xs text-slate-400">Sin definir</span>

  return (
    <span className="inline-flex items-center justify-center" title={data.label}>
      <img src={data.flag} alt={`Bandera ${data.label}`} className="h-11 w-11 object-contain drop-shadow-sm" />
      <span className="sr-only">{data.label}</span>
    </span>
  )
}

function ActionButtons({ user, isSelf, busy, onEdit, onToggle, onDelete }) {
  const baseClass = 'grid h-9 w-9 place-items-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-30'
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => onEdit(user)}
        title="Editar usuario"
        aria-label={`Editar a ${user.username}`}
        className={`${baseClass} border-blue-100 bg-blue-50/70 text-blue-600 hover:bg-blue-100`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19 3 20l1-4Z" /></svg>
      </button>
      <button
        type="button"
        onClick={() => onToggle(user)}
        disabled={busy}
        title={user.is_active ? 'Desactivar usuario' : 'Activar usuario'}
        aria-label={user.is_active ? `Desactivar a ${user.username}` : `Activar a ${user.username}`}
        className={`${baseClass} border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          {user.is_active ? <path d="M9 10V7a4 4 0 0 1 7.5-2" /> : <path d="M8 10V7a4 4 0 0 1 8 0v3" />}
          <path d="M12 14v2" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onDelete(user)}
        disabled={isSelf || busy}
        title={isSelf ? 'No puedes eliminar tu propia cuenta' : 'Eliminar usuario'}
        aria-label={`Eliminar a ${user.username}`}
        className={`${baseClass} border-red-100 bg-red-50/70 text-red-500 hover:bg-red-100`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>
      </button>
    </div>
  )
}

export default function UsersSection() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalMode, setModalMode] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const currentUsername = getUsername()

  async function loadUsers() {
    setLoading(true)
    setError(null)
    try {
      setUsers(await listUsers())
    } catch (err) {
      setError(err.message || 'No se pudo cargar la lista de usuarios.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) => user.username.toLowerCase().includes(query) || user.email.toLowerCase().includes(query))
  }, [users, search])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const visibleUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const firstVisible = filteredUsers.length ? (page - 1) * PAGE_SIZE + 1 : 0
  const lastVisible = Math.min(page * PAGE_SIZE, filteredUsers.length)

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function openCreate() {
    setEditingUser(null)
    setModalMode('create')
  }

  function openEdit(user) {
    setEditingUser(user)
    setModalMode('edit')
  }

  function closeModal() {
    setModalMode(null)
    setEditingUser(null)
  }

  async function handleSubmit(payload) {
    if (modalMode === 'edit') {
      const updated = await updateUser(editingUser.id, payload)
      setUsers((previous) => previous.map((user) => (user.id === updated.id ? updated : user)))
    } else {
      const created = await createUser(payload)
      setUsers((previous) => [...previous, created])
    }
    closeModal()
  }

  async function handleToggleActive(user) {
    setActionError(null)
    setBusyId(user.id)
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active })
      setUsers((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setActionError(err.message || 'No se pudo cambiar el estado del usuario.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`¿Eliminar al usuario "${user.username}"? Esta acción no se puede deshacer.`)) return
    setActionError(null)
    setBusyId(user.id)
    try {
      await deleteUser(user.id)
      setUsers((previous) => previous.filter((item) => item.id !== user.id))
    } catch (err) {
      setActionError(err.message || 'No se pudo eliminar el usuario.')
    } finally {
      setBusyId(null)
    }
  }

  const feedback = loading ? 'Cargando usuarios...' : error || (filteredUsers.length === 0 ? 'No se encontraron usuarios.' : null)

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/60 text-blue-600 shadow-sm ring-1 ring-blue-100 sm:h-16 sm:w-16">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="7" r="3" /><path d="M3.5 20v-2c0-3 2.1-5 5.5-5s5.5 2 5.5 5v2M16 4.5a3 3 0 0 1 0 5.8M16.5 13c2.7.2 4 2 4 4.5V20" /></svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#0b1739] sm:text-[28px]">Usuarios</h1>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">Gestiona los usuarios del sistema.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#075fe5] to-[#2697f2] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(21,94,239,.2)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-blue-300 sm:w-auto"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo Usuario
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(30,55,90,.08)] sm:p-5">
        <label className="relative block w-full lg:max-w-[460px]">
          <span className="sr-only">Buscar usuario o correo</span>
          <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar usuario o correo..."
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </label>
      </div>

      {actionError && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(30,55,90,.08)]">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1050px] table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/40 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-[15%] px-6 py-5">Usuario</th>
                <th className="w-[22%] px-5 py-5">Correo</th>
                <th className="w-[15%] px-5 py-5 text-center">Nacionalidad</th>
                <th className="w-[14%] px-5 py-5">Rol</th>
                <th className="w-[12%] px-5 py-5">Estado</th>
                <th className="w-[12%] px-5 py-5">Creado</th>
                <th className="w-[10%] px-5 py-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {feedback && <tr><td colSpan={7} className={`px-6 py-16 text-center ${error ? 'text-red-600' : 'text-slate-400'}`}>{feedback}</td></tr>}
              {!feedback && visibleUsers.map((user) => {
                const isSelf = user.username === currentUsername
                return (
                  <tr key={user.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50/50">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4"><UserAvatar username={user.username} /><strong className="truncate text-[#101a38]">{user.username}</strong></div>
                    </td>
                    <td className="truncate px-5 py-5 text-slate-600" title={user.email}>{user.email}</td>
                    <td className="px-5 py-3 text-center"><NationalityBadge nationality={user.nationality} /></td>
                    <td className="px-5 py-5"><RoleBadge role={user.role} /></td>
                    <td className="px-5 py-5"><StatusBadge active={user.is_active} /></td>
                    <td className="px-5 py-5 text-[#17213e]">
                      <span className="flex items-center gap-2">
                        <svg className="h-5 w-5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></svg>
                        {formatDate(user.created_at)}
                      </span>
                    </td>
                    <td className="px-5 py-5"><ActionButtons user={user} isSelf={isSelf} busy={busyId === user.id} onEdit={openEdit} onToggle={handleToggleActive} onDelete={handleDelete} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-200 md:hidden">
          {feedback && <p className={`px-5 py-14 text-center text-sm ${error ? 'text-red-600' : 'text-slate-400'}`}>{feedback}</p>}
          {!feedback && visibleUsers.map((user) => (
            <article key={user.id} className="p-4 sm:p-5">
              <div className="mb-4 flex min-w-0 items-center gap-3">
                <UserAvatar username={user.username} />
                <div className="min-w-0"><h2 className="truncate font-semibold text-[#101a38]">{user.username}</h2><p className="truncate text-sm text-slate-500">{user.email}</p></div>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-3"><NationalityBadge nationality={user.nationality} /><RoleBadge role={user.role} /><StatusBadge active={user.is_active} /></div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></svg>
                  {formatDate(user.created_at)}
                </span>
                <ActionButtons user={user} isSelf={user.username === currentUsername} busy={busyId === user.id} onEdit={openEdit} onToggle={handleToggleActive} onDelete={handleDelete} />
              </div>
            </article>
          ))}
        </div>

        {!feedback && (
          <div className="flex flex-col gap-4 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>Mostrando <strong>{firstVisible}</strong> a <strong>{lastVisible}</strong> de <strong>{filteredUsers.length}</strong> usuarios</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Página anterior" className="grid h-9 w-10 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-35"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg></button>
              <span className="grid h-9 min-w-10 place-items-center rounded-lg bg-blue-50 px-3 font-semibold text-blue-700 ring-1 ring-blue-100">{page}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} aria-label="Página siguiente" className="grid h-9 w-10 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-35"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></button>
            </div>
          </div>
        )}
      </div>

      {modalMode && <UserFormModal mode={modalMode} initialData={editingUser} existingUsers={users} onClose={closeModal} onSubmit={handleSubmit} />}
    </section>
  )
}
