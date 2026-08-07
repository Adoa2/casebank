import { useState } from 'react'
import AuthField from '../components/AuthField'
import AuthMessage from '../components/AuthMessage'
import { forgotPassword } from '../api/auth'

export default function ForgotPasswordView({ onBackToLogin, onCodeSent }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage(null)
    setLoading(true)

    const trimmedEmail = email.trim()

    try {
      await forgotPassword(trimmedEmail)
      onCodeSent(trimmedEmail)
    } catch (err) {
      setMessage({ text: err.message || 'No se pudo conectar con el servidor.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="w-full" onSubmit={handleSubmit} noValidate>
      <h2 className="font-display text-[1.75rem] font-semibold mb-1.5">Recupera tu acceso</h2>
      <p className="text-slate mb-8">Confirma tu correo para continuar.</p>

      <AuthMessage text={message?.text} type={message?.type} />

      <AuthField
        id="forgotEmail"
        label="Correo electrónico"
        type="email"
        placeholder="nombre@cooperativa.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-[10px] text-white font-semibold text-[0.98rem] bg-gradient-to-r from-brand-blue to-sky-cyan hover:brightness-105 active:translate-y-px disabled:opacity-70 transition"
      >
        {loading ? 'Enviando código...' : 'Verificar identidad'}
      </button>

      <div className="text-center mt-6 text-sm text-slate">
        Volver a{' '}
        <button type="button" onClick={onBackToLogin} className="text-brand-blue hover:underline">
          iniciar sesión
        </button>
      </div>
    </form>
  )
}