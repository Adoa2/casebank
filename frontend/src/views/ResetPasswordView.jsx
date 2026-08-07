import { useState } from 'react'
import AuthField from '../components/AuthField'
import AuthMessage from '../components/AuthMessage'
import { resetPassword } from '../api/auth'

export default function ResetPasswordView({ email, onBackToLogin, onReset }) {
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [message, setMessage] = useState({
    text: 'Si los datos son correctos, revisa tu correo por el código.',
    type: 'info',
  })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    if (newPassword !== newPasswordConfirm) {
      setMessage({ text: 'Las contraseñas no coinciden.', type: 'error' })
      return
    }

    setMessage(null)
    setLoading(true)

    try {
      await resetPassword(email, code.trim(), newPassword)
      onReset()
    } catch (err) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="w-full" onSubmit={handleSubmit} noValidate>
      <h2 className="font-display text-[1.75rem] font-semibold mb-1.5">Ingrese el código</h2>
      <p className="text-slate mb-8">Te enviamos un código de 6 dígitos a tu correo. Por favor, rebice su buzón.</p>

      <AuthMessage text={message?.text} type={message?.type} />

      <AuthField
        id="resetCode"
        label="Código de verificación"
        placeholder="123456"
        inputMode="numeric"
        maxLength={6}
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <AuthField
        id="resetNewPassword"
        label="Nueva contraseña"
        type="password"
        placeholder="********"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <p className="text-xs text-slate -mt-4 mb-4">La contraseña debe tener al menos 8 caracteres.</p>
      <AuthField
        id="resetNewPasswordConfirm"
        label="Confirmar nueva contraseña"
        type="password"
        placeholder="********"
        autoComplete="new-password"
        value={newPasswordConfirm}
        onChange={(e) => setNewPasswordConfirm(e.target.value)}
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-[10px] text-white font-semibold text-[0.98rem] bg-gradient-to-r from-brand-blue to-sky-cyan hover:brightness-105 active:translate-y-px disabled:opacity-70 transition"
      >
        {loading ? 'Actualizando...' : 'Actualizar contraseña'}
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