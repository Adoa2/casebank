import { useEffect, useMemo, useState } from 'react'
import { listUsers, createUser, updateUser, deleteUser } from '../api/adminUsers'
import { getUsername } from '../api/authToken'
import UserFormModal from './UserFormModal'

const ROLE_LABELS = { 0: 'Usuario', 1: 'Administrador', 2: 'Privilegio mayor' }
const ROLE_BADGE = {
  0: 'bg-slate-100 text-slate-600',
  1: 'bg-blue-100 text-brand-blue',
  2: 'bg-purple-100 text-purple-700',
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '-'
  }
}

export default function UsersSection() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState(null) // null | 'create' | 'edit'
  const [editingUser, setEditingUser] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const currentUsername = getUsername()

  async function loadUsers() {
    setLoading(true)
    setError(null)
    try {
      const data = await listUsers()
      setUsers(data)
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
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [users, search])

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
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    } else {
      const created = await createUser(payload)
      setUsers((prev) => [...prev, created])
    }
    closeModal()
  }

  async function handleToggleActive(user) {
    setActionError(null)
    setBusyId(user.id)
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active })
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    } catch (err) {
      setActionError(err.message || 'No se pudo cambiar el estado del usuario.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`¿Eliminar al usuario "${user.username}"? Esta acción no se puede deshacer.`)) {
      return
    }
    setActionError(null)
    setBusyId(user.id)
    try {
      await deleteUser(user.id)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } catch (err) {
      setActionError(err.message || 'No se pudo eliminar el usuario.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Usuarios</h1>
          <p className="text-sm text-slate">Gestiona los usuarios del sistema</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
        >
          + Nuevo Usuario
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar usuario o correo..."
          className="w-full max-w-sm rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        />
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-blue-50/60 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Creado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Cargando usuarios...
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No se encontraron usuarios.
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              filteredUsers.map((u) => {
                const isSelf = u.username === currentUsername
                const busy = busyId === u.id
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-slate-900">{u.username}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_BADGE[u.role]}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          title="Editar"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-blue"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19 3 20l1-4Z" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          disabled={busy}
                          title={u.is_active ? 'Desactivar' : 'Activar'}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-blue disabled:opacity-50"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="4.5" y="10.5" width="15" height="9" rx="2" />
                            <path d="M8 10.5V7.5a4 4 0 0 1 8 0" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          disabled={isSelf || busy}
                          title={isSelf ? 'No puedes eliminar tu propia cuenta' : 'Eliminar'}
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
        <UserFormModal
          mode={modalMode}
          initialData={editingUser}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}