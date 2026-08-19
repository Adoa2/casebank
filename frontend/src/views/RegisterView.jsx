import { useState } from 'react'
import AuthField from '../components/AuthField'
import AuthMessage from '../components/AuthMessage'
import { register } from '../api/auth'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RULES = [
  { label: '8+ caracteres', test: (value) => value.length >= 8 },
  { label: 'Una mayúscula', test: (value) => /[A-ZÁÉÍÓÚÑ]/.test(value) },
  { label: 'Una minúscula', test: (value) => /[a-záéíóúñ]/.test(value) },
  { label: 'Un número', test: (value) => /\d/.test(value) },
  { label: 'Un carácter especial', test: (value) => /[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s]/.test(value) },
]

export default function RegisterView({ onBackToLogin, onRegistered }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [nationality, setNationality] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage(null)

    const trimmedEmail = email.trim()

    if (!nationality) {
      setMessage({ text: 'Selecciona una nacionalidad.', type: 'error' })
      return
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setMessage({ text: 'Ingresa un correo electrónico válido.', type: 'error' })
      return
    }

    if (!PASSWORD_RULES.every((rule) => rule.test(password))) {
      setMessage({ text: 'La contraseña debe incluir 8 caracteres, mayúscula, minúscula, número y carácter especial.', type: 'error' })
      return
    }

    if (password !== passwordConfirm) {
      setMessage({ text: 'Las contraseñas no coinciden.', type: 'error' })
      return
    }

    setLoading(true)
    try {
      await register(username.trim(), trimmedEmail, password, nationality)
      onRegistered()
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="w-full" onSubmit={handleSubmit} noValidate>
      <h2 className="font-display text-[1.75rem] font-semibold mb-1.5">Crea tu cuenta</h2>
      <p className="text-slate mb-5">Regístrate para acceder al manual interactivo.</p>

      <AuthMessage text={message?.text} type={message?.type} />

      <AuthField
        id="regUsername"
        label="Usuario"
        placeholder="Digite un usuario"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        compact
      />
      <AuthField
        id="regEmail"
        label="Correo electrónico"
        type="email"
        placeholder="nombre@cooperativa.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        compact
      />
      <div className="mb-3">
        <label htmlFor="regNationality" className="mb-1.5 block text-[0.78rem] font-bold text-[#14254c]">
          Nacionalidad
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-[#8796b6]" aria-hidden="true">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
          </span>
          <select
            id="regNationality"
            name="nationality"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            required
            className={`h-12 w-full appearance-none rounded-xl border border-[#d9e1ef] bg-white pl-12 pr-12 text-[0.92rem] shadow-sm outline-none transition focus:border-brand-blue focus:ring-[3px] focus:ring-brand-blue/10 ${nationality ? 'text-ink' : 'text-[#8a98b5]'}`}
          >
            <option value="" disabled>Seleccione una nacionalidad</option>
            <option value="hondurena">Hondureña</option>
            <option value="dominicana">Dominicana</option>
          </select>
          <svg className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8796b6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m7 10 5 5 5-5" />
          </svg>
        </div>
      </div>
      <AuthField
        id="regPassword"
        label="Contraseña"
        type="password"
        placeholder="********"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        compact
      />
      {password && (
        <ul className="-mt-1 mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.68rem]" aria-label="Requisitos de contraseña">
          {PASSWORD_RULES.map((rule) => {
            const valid = rule.test(password)
            return (
              <li key={rule.label} className={`flex items-center gap-1.5 ${valid ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span aria-hidden="true" className="font-bold">{valid ? '✓' : '○'}</span>{rule.label}
              </li>
            )
          })}
        </ul>
      )}
      <AuthField
        id="regPasswordConfirm"
        label="Confirmar contraseña"
        type="password"
        placeholder="********"
        autoComplete="new-password"
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
        compact
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-[10px] text-white font-semibold text-[0.98rem] bg-gradient-to-r from-brand-blue to-sky-cyan hover:brightness-105 active:translate-y-px disabled:opacity-70 transition"
      >
        {loading ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>

      <div className="text-center mt-4 text-sm text-slate">
        ¿Ya tienes cuenta?{' '}
        <button type="button" onClick={onBackToLogin} className="text-brand-blue hover:underline">
          Inicia sesión
        </button>
      </div>
    </form>
  )
}
