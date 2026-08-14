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
    <form className="flex min-h-full w-full flex-col" onSubmit={handleSubmit} noValidate>
      <div className="mb-6 flex justify-center">
        <div className="security-mark">
          <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" /></svg>
        </div>
      </div>
      <h2 className="text-center font-display text-[1.75rem] font-bold tracking-[-0.03em] text-[#0d1d43]">
        Bienvenido <span className="text-blue-600">de nuevo</span>
      </h2>
      <p className="mb-8 mt-2 text-center text-sm text-[#8591aa]">Inicia sesión para continuar.</p>

      <AuthMessage text={message?.text} type={message?.type} />
      <AuthField id="loginUsername" label="Usuario" placeholder="Tu usuario" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <AuthField id="loginPassword" label="Contraseña" type="password" placeholder="Tu contraseña" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />

      <div className="-mt-1 mb-7 flex justify-end">
        <button type="button" onClick={onGoForgot} className="text-[0.8rem] font-medium text-brand-blue hover:underline">¿Olvidaste tu contraseña?</button>
      </div>
      <button type="submit" disabled={loading} className="flex h-[50px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#3051f4] to-[#19c7e3] text-[0.92rem] font-bold text-white shadow-[0_10px_24px_rgba(34,104,238,.18)] transition hover:brightness-105 active:translate-y-px disabled:opacity-70">
        {loading ? 'Verificando...' : 'Iniciar sesión'}
      </button>
      <div className="mt-auto pt-16 text-center text-sm text-[#7d8aa5]">
        ¿No tienes cuenta?{' '}
        <button type="button" onClick={onGoRegister} className="font-semibold text-brand-blue hover:underline">Regístrate</button>
      </div>
    </form>
  )
}
