import { useEffect, useMemo, useState } from 'react'

const ROLE_OPTIONS = [
  { value: 1, label: 'Administrador', description: 'Acceso total al sistema. Puede gestionar usuarios, configuraciones y contenido.', icon: 'shield' },
  { value: 0, label: 'Usuario', description: 'Puede consultar y utilizar las funcionalidades del sistema.', icon: 'user' },
  { value: 2, label: 'Privilegio mayor', description: 'Acceso avanzado con permisos especiales asignados.', icon: 'badge' },
]

const PASSWORD_RULES = [
  { label: 'Mínimo 8 caracteres', test: (value) => value.length >= 8 },
  { label: 'Una letra mayúscula', test: (value) => /[A-ZÁÉÍÓÚÑ]/.test(value) },
  { label: 'Una letra minúscula', test: (value) => /[a-záéíóúñ]/.test(value) },
  { label: 'Un número', test: (value) => /\d/.test(value) },
  { label: 'Un carácter especial', test: (value) => /[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s]/.test(value) },
]

function Icon({ name, className = 'h-5 w-5' }) {
  const paths = {
    identity: <><rect x="5" y="3" width="14" height="18" rx="3" /><circle cx="12" cy="9" r="2.5" /><path d="M8.5 17c.4-2 1.6-3 3.5-3s3.1 1 3.5 3M9 3V2h6v1" /></>,
    shield: <path d="M12 2.8 19 6v5.2c0 4.5-2.8 8-7 9.8-4.2-1.8-7-5.3-7-9.8V6l7-3.2Z" />,
    user: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2.5C5 14.8 7.5 13 12 13s7 1.8 7 5.5V21" /></>,
    badge: <><path d="m12 2 2.2 2.2 3.1.4.5 3.1L20 10l-2.2 2.2-.5 3.1-3.1.5L12 18l-2.2-2.2-3.1-.5-.5-3.1L4 10l2.2-2.3.5-3.1 3.1-.4L12 2Z" /><path d="m9.5 10 1.6 1.6 3.5-3.5" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    status: <><path d="M12 2.8 19 6v5.2c0 4.5-2.8 8-7 9.8-4.2-1.8-7-5.3-7-9.8V6l7-3.2Z" /><path d="m9.2 11.7 1.8 1.8 4-4" /></>,
    save: <><path d="M5 3h12l2 2v16H5V3Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>,
  }
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function SectionHeading({ number, icon, title, description }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2.5 text-sm font-semibold text-blue-600">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
        <span>{number}. {title}</span>
      </div>
      {description && <p className="mt-1.5 text-xs leading-5 text-slate-500 sm:text-[13px]">{description}</p>}
    </div>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[#17213e] sm:text-[13px]">{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-4 text-slate-500 sm:text-xs">{hint}</p>}
    </div>
  )
}

export default function UserFormModal({ mode, initialData, existingUsers = [], onClose, onSubmit }) {
  const isEdit = mode === 'edit'
  const [username, setUsername] = useState(initialData?.username || '')
  const [email, setEmail] = useState(initialData?.email || '')
  const [nationality, setNationality] = useState(initialData?.nationality || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(initialData?.role ?? (isEdit ? 0 : 1))
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const passwordChecks = useMemo(() => PASSWORD_RULES.map((rule) => ({ ...rule, valid: rule.test(password) })), [password])
  const normalizedUsername = username.trim().toLocaleLowerCase('es')
  const usernameTaken = !isEdit && normalizedUsername.length > 0 && existingUsers.some(
    (user) => user.username?.trim().toLocaleLowerCase('es') === normalizedUsername,
  )
  const passedRules = passwordChecks.filter((rule) => rule.valid).length
  const passwordIsValid = passedRules === PASSWORD_RULES.length
  const strength = passedRules <= 1 ? 'Débil' : passedRules <= 3 ? 'Media' : passedRules === 4 ? 'Buena' : 'Fuerte'
  const strengthColor = passedRules <= 1 ? 'bg-red-400' : passedRules <= 3 ? 'bg-amber-400' : 'bg-emerald-500'

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, saving])

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (usernameTaken) {
      setError('El nombre de usuario ya está registrado. Elige uno diferente.')
      return
    }
    if (!nationality) {
      setError('Selecciona la nacionalidad del usuario.')
      return
    }
    if ((!isEdit || password) && !passwordIsValid) {
      setError('La contraseña debe cumplir todos los requisitos de seguridad.')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        const payload = { email, nationality, role: Number(role), is_active: isActive }
        if (password) payload.password = password
        await onSubmit(payload)
      } else {
        await onSubmit({ username, email, nationality, password, role: Number(role), is_active: isActive })
      }
    } catch (err) {
      setError(err.message || 'No se pudo guardar el usuario.')
      setSaving(false)
    }
  }

  const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-[#17213e] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500'

  return (
    <div className="user-form-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="user-form-modal-panel overflow-y-auto rounded-2xl bg-white shadow-[0_28px_70px_rgba(15,23,42,.28)]">
        <div className="px-5 pb-6 pt-5 sm:px-9 sm:pb-7 sm:pt-7">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 id="user-modal-title" className="text-xl font-bold tracking-tight text-[#101a38] sm:text-[26px]">{isEdit ? 'Editar usuario' : 'Crear nuevo usuario'}</h2>
              <p className="mt-2 text-xs text-slate-500 sm:text-sm">{isEdit ? 'Actualiza la información y los permisos de esta cuenta.' : 'Completa la información para crear una nueva cuenta.'}</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <form onSubmit={handleSubmit} noValidate>
            {error && <div role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <section>
              <SectionHeading number="1" icon="identity" title="Identidad" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre de usuario" required hint={isEdit ? 'El nombre de usuario no se puede modificar.' : 'Solo letras, números, puntos y guiones bajos.'}>
                  <input type="text" value={username} onChange={(event) => { setUsername(event.target.value); setError(null) }} disabled={isEdit} required autoComplete="username" placeholder="juan.perez" aria-invalid={usernameTaken} aria-describedby={usernameTaken ? 'username-exists-error' : undefined} className={`${inputClass} ${usernameTaken ? '!border-red-400 focus:!border-red-500 focus:!ring-red-100' : ''}`} />
                  {usernameTaken && <p id="username-exists-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600"><svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="8" r="6" /><path d="M8 4.5v4M8 11.5h.01" /></svg>Este nombre de usuario ya está registrado.</p>}
                </Field>
                <Field label="Correo electrónico" required hint="Se enviará la información de acceso a este correo.">
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="juan.perez@casebank.com" className={inputClass} />
                </Field>
              </div>
              <div className="mt-4 max-w-[360px]">
                <Field label="Nacionalidad" required hint="Selecciona la nacionalidad registrada para esta cuenta.">
                  <div className="relative">
                    <svg className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
                    <select value={nationality} onChange={(event) => { setNationality(event.target.value); setError(null) }} required className={`${inputClass} appearance-none pl-11 pr-10 ${nationality ? '' : 'text-slate-400'}`}>
                      <option value="" disabled>Selecciona una nacionalidad</option>
                      <option value="hondurena">Hondureña</option>
                      <option value="dominicana">Dominicana</option>
                    </select>
                    <svg className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </div>
                </Field>
              </div>
            </section>

            <section className="mt-6">
              <SectionHeading number="2" icon="badge" title="Rol" description="Selecciona el rol que definirá los permisos del usuario." />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {ROLE_OPTIONS.map((option) => {
                  const selected = Number(role) === option.value
                  return (
                    <label key={option.value} className={`relative min-h-[142px] cursor-pointer rounded-xl border p-4 transition ${selected ? 'border-blue-500 bg-blue-50/30 shadow-[0_0_0_1px_rgba(59,130,246,.08)]' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50/50'}`}>
                      <input type="radio" name="role" value={option.value} checked={selected} onChange={() => setRole(option.value)} className="sr-only" />
                      <span className={`mb-3 grid h-7 w-7 place-items-center ${selected ? 'text-blue-600' : 'text-[#17213e]'}`}><Icon name={option.icon} className="h-6 w-6" /></span>
                      <span className="block text-sm font-semibold text-[#17213e]">{option.label}</span>
                      <span className="mt-1.5 block text-[11px] leading-[1.55] text-slate-500 sm:text-xs">{option.description}</span>
                      <span className={`absolute right-4 top-4 grid h-5 w-5 place-items-center rounded-full border ${selected ? 'border-blue-500' : 'border-slate-300'}`}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />}</span>
                    </label>
                  )
                })}
              </div>
            </section>

            <section className="mt-6">
              <SectionHeading number="3" icon="lock" title="Seguridad" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.35fr_.9fr] sm:gap-8">
                <Field label={isEdit ? 'Nueva contraseña' : 'Contraseña'} required={!isEdit} hint={isEdit ? 'Déjala en blanco para conservar la contraseña actual.' : 'La contraseña debe ingresarse manualmente.'}>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required={!isEdit} autoComplete="new-password" placeholder="••••••••••••" className={`${inputClass} pr-11`} />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-600 hover:bg-slate-50" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{showPassword ? <path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M6.5 6.7C4.3 8.1 2.7 10 2 12c1.5 3.9 5.5 7 10 7 1.6 0 3.1-.4 4.5-1.1M9.9 4.2A10.6 10.6 0 0 1 12 4c4.5 0 8.5 3.1 10 7-.5 1.3-1.3 2.6-2.3 3.7" /> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}</svg>
                    </button>
                  </div>
                  {password && <div className="mt-2"><p className="text-[11px] text-slate-500">Fortaleza: <span className={`font-semibold ${passedRules >= 4 ? 'text-emerald-600' : passedRules >= 2 ? 'text-amber-600' : 'text-red-500'}`}>{strength}</span></p><div className="mt-1.5 grid grid-cols-5 gap-1">{[1, 2, 3, 4, 5].map((level) => <span key={level} className={`h-1 rounded-full ${level <= passedRules ? strengthColor : 'bg-slate-200'}`} />)}</div></div>}
                </Field>
                <ul className="space-y-1.5 pt-0 text-[11px] sm:pt-1 sm:text-xs" aria-label="Requisitos de contraseña">
                  {passwordChecks.map((rule) => <li key={rule.label} className={`flex items-center gap-2 ${rule.valid ? 'text-emerald-600' : 'text-slate-400'}`}><span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${rule.valid ? 'bg-emerald-50' : 'bg-slate-100'}`}><svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 8 2.4 2.4L12 5" /></svg></span>{rule.label}</li>)}
                </ul>
              </div>
            </section>

            <section className="mt-6">
              <SectionHeading number="4" icon="status" title="Estado" description="Define el estado inicial de la cuenta." />
              <div className="max-w-[360px]">
                <Field label="Estado" required hint="El usuario podrá acceder al sistema según este estado.">
                  <div className="relative">
                    <span className={`pointer-events-none absolute left-4 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <select value={isActive ? 'activo' : 'inactivo'} onChange={(event) => setIsActive(event.target.value === 'activo')} className={`${inputClass} appearance-none pl-10 pr-10`}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select>
                    <svg className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </div>
                </Field>
              </div>
            </section>

            <footer className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-lg border border-slate-200 bg-white px-7 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={saving || usernameTaken} title={usernameTaken ? 'Elige un nombre de usuario disponible' : undefined} className="inline-flex h-11 items-center justify-center gap-2.5 rounded-lg bg-gradient-to-r from-[#075fe5] to-[#1479ef] px-7 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(21,94,239,.22)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-70"><Icon name="save" className="h-[18px] w-[18px]" />{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}</button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  )
}
