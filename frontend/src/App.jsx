import { useState } from 'react'
import BrandPanel from './components/BrandPanel'
import LoginView from './views/LoginView'
import RegisterView from './views/RegisterView'
import ForgotPasswordView from './views/ForgotPasswordView'
import ResetPasswordView from './views/ResetPasswordView'
import DashboardView from './views/DashboardView'

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(localStorage.getItem('casebank_token')))
  const [view, setView] = useState('login')
  const [resetUsername, setResetUsername] = useState('')
  const [loginNotice, setLoginNotice] = useState(null)

  function goToReset(username) {
    setResetUsername(username)
    setView('reset')
  }

  function goToLoginWithNotice(notice) {
    setLoginNotice(notice)
    setView('login')
  }

  function handleLogout() {
    localStorage.removeItem('casebank_token')
    setAuthenticated(false)
    setView('login')
  }

  if (authenticated) {
    return <DashboardView onLogout={handleLogout} />
  }

  return (
    <div className="grid md:grid-cols-2 min-h-screen">
      <BrandPanel />

      <div className="flex items-center justify-center px-6 py-10 bg-paper">
        <div className="w-full max-w-[380px]">
          {view === 'login' && (
            <LoginView
              notice={loginNotice}
              onConsumeNotice={() => setLoginNotice(null)}
              onGoRegister={() => setView('register')}
              onGoForgot={() => setView('forgot')}
              onLoginSuccess={() => setAuthenticated(true)}
            />
          )}

          {view === 'register' && (
            <RegisterView
              onBackToLogin={() => setView('login')}
              onRegistered={() =>
                goToLoginWithNotice({ text: 'Cuenta creada. Ya puedes iniciar sesión.', type: 'success' })
              }
            />
          )}

          {view === 'forgot' && (
            <ForgotPasswordView onBackToLogin={() => setView('login')} onCodeSent={goToReset} />
          )}

          {view === 'reset' && (
            <ResetPasswordView
              username={resetUsername}
              onBackToLogin={() => setView('login')}
              onReset={() =>
                goToLoginWithNotice({ text: 'Contraseña actualizada. Ya puedes iniciar sesión.', type: 'success' })
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}
