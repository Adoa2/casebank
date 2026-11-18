// Formulario de restablecimiento de contraseña: valida el código de 6 dígitos y establece la nueva contraseña.
import { useState } from 'react'
import AuthField from '../components/AuthField'
import AuthMessage from '../components/AuthMessage'
import { resetPassword } from '../api/auth'

/** Vista de restablecimiento de contraseña: verifica el código y establece la nueva contraseña. */
export default function ResetPasswordView({ correo, onBackToLogin, onReset }) {
  const [codigo, setCodigo] = useState('')
  const [nuevaContrasena, setNuevaContrasena] = useState('')
  const [nuevaContrasenaConfirm, setNuevaContrasenaConfirm] = useState('')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    // Verificar coincidencia de contraseñas antes de llamar al backend
    if (nuevaContrasena !== nuevaContrasenaConfirm) {
      setMessage({ text: 'Las contraseñas no coinciden.', type: 'error' })
      return
    }

    setMessage(null)
    setLoading(true)

    try {
      await resetPassword(correo, codigo.trim(), nuevaContrasena)
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
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
      />
      <AuthField
        id="resetNewPassword"
        label="Nueva contraseña"
        type="password"
        placeholder="********"
        autoComplete="new-password"
        value={nuevaContrasena}
        onChange={(e) => setNuevaContrasena(e.target.value)}
      />
      <p className="text-xs text-slate -mt-4 mb-4">La contraseña debe tener al menos 8 caracteres.</p>
      <AuthField
        id="resetNewPasswordConfirm"
        label="Confirmar nueva contraseña"
        type="password"
        placeholder="********"
        autoComplete="new-password"
        value={nuevaContrasenaConfirm}
        onChange={(e) => setNuevaContrasenaConfirm(e.target.value)}
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