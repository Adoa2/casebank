import { useState } from 'react'
import AuthField from '../components/AuthField'
import AuthMessage from '../components/AuthMessage'
import { register } from '../api/auth'

export default function RegisterView({ onBackToLogin, onRegistered }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage(null)

    if (password !== passwordConfirm) {
      setMessage({ text: 'Las contraseñas no coinciden.', type: 'error' })
      return
    }

    setLoading(true)
    try {
      await register(username.trim(), email.trim(), password)
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
      <p className="text-slate mb-8">Regístrate para acceder al manual interactivo.</p>

      <AuthMessage text={message?.text} type={message?.type} />

      <AuthField
        id="regUsername"
        label="Usuario"
        placeholder="Digite un usuario"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <AuthField
        id="regEmail"
        label="Correo electrónico"
        type="email"
        placeholder="nombre@cooperativa.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <AuthField
        id="regPassword"
        label="Contraseña"
        type="password"
        placeholder="********"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <AuthField
        id="regPasswordConfirm"
        label="Confirmar contraseña"
        type="password"
        placeholder="********"
        autoComplete="new-password"
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-[10px] text-white font-semibold text-[0.98rem] bg-gradient-to-r from-brand-blue to-sky-cyan hover:brightness-105 active:translate-y-px disabled:opacity-70 transition"
      >
        {loading ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>

      <div className="text-center mt-6 text-sm text-slate">
        ¿Ya tienes cuenta?{' '}
        <button type="button" onClick={onBackToLogin} className="text-brand-blue hover:underline">
          Inicia sesión
        </button>
      </div>
    </form>
  )
}
