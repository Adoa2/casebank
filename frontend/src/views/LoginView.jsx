import { useEffect, useState } from 'react'
import AuthField from '../components/AuthField'
import AuthMessage from '../components/AuthMessage'
import { login } from '../api/auth'
import { setAuthData } from '../api/authToken'

export default function LoginView({ notice, onConsumeNotice, onGoRegister, onGoForgot, onLoginSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (notice) {
      setMessage(notice)
      onConsumeNotice()
    }
  }, [notice, onConsumeNotice])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage(null)
    setLoading(true)

    try {
      const data = await login(username, password)
      setAuthData(data)
      onLoginSuccess()
    } catch (err) {
      setMessage({ text: err.message || 'No se pudo conectar con el servidor.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="w-full" onSubmit={handleSubmit} noValidate>
      <h2 className="font-display text-[1.75rem] font-semibold mb-1.5">Inicia sesión</h2>
      <p className="text-slate mb-8">Ingresa con tu cuenta para ver el manual.</p>

      <AuthMessage text={message?.text} type={message?.type} />

      <AuthField
        id="loginUsername"
        label="Usuario"
        placeholder="tu usuario"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <AuthField
        id="loginPassword"
        label="Contraseña"
        type="password"
        placeholder="********"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <div className="flex justify-end -mt-2.5 mb-6">
        <button type="button" onClick={onGoForgot} className="text-brand-blue text-sm hover:underline">
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-[10px] text-white font-semibold text-[0.98rem] bg-gradient-to-r from-brand-blue to-sky-cyan hover:brightness-105 active:translate-y-px disabled:opacity-70 transition"
      >
        {loading ? 'Verificando...' : 'Iniciar sesión'}
      </button>

      <div className="text-center mt-6 text-sm text-slate">
        ¿No tienes cuenta?{' '}
        <button type="button" onClick={onGoRegister} className="text-brand-blue hover:underline">
          Regístrate
        </button>
      </div>
    </form>
  )
}