import { useState } from 'react'

const ROLE_OPTIONS = [
  { value: 0, label: 'Usuario' },
  { value: 1, label: 'Administrador' },
  { value: 2, label: 'Privilegio mayor' },
]

export default function UserFormModal({ mode, initialData, onClose, onSubmit }) {
  const isEdit = mode === 'edit'

  const [username, setUsername] = useState(initialData?.username || '')
  const [email, setEmail] = useState(initialData?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(initialData?.role ?? 0)
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!isEdit && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (isEdit && password && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        const payload = { email, role: Number(role), is_active: isActive }
        if (password) payload.password = password
        await onSubmit(payload)
      } else {
        await onSubmit({
          username,
          email,
          password,
          role: Number(role),
          is_active: isActive,
        })
      }
    } catch (err) {
      setError(err.message || 'No se pudo guardar el usuario.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6">
        <h2 className="mb-5 text-lg font-semibold text-slate-900">
          {isEdit ? 'Editar Usuario' : 'Nuevo Usuario'}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isEdit}
                required
                placeholder="Ej. jlopez"
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Rol</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="ejemplo@casebank.com"
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
              <select
                value={isActive ? 'activo' : 'inactivo'}
                onChange={(e) => setIsActive(e.target.value === 'activo')}
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Contraseña {isEdit && <span className="font-normal text-slate-400">(dejar en blanco para no cambiar)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!isEdit}
                  placeholder="********"
                  className="w-full rounded-lg border border-line px-3 py-2.5 pr-10 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    {showPassword ? (
                      <path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M6.5 6.7C4.3 8.1 2.7 10 2 12c1.5 3.9 5.5 7 10 7 1.6 0 3.1-.4 4.5-1.1M9.9 4.2A10.6 10.6 0 0 1 12 4c4.5 0 8.5 3.1 10 7-.5 1.3-1.3 2.6-2.3 3.7" />
                    ) : (
                      <>
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-70"
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
