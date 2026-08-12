import { useState } from 'react'
import BrandPanel from './components/BrandPanel'
import LoginView from './views/LoginView'
import RegisterView from './views/RegisterView'
import ForgotPasswordView from './views/ForgotPasswordView'
import ResetPasswordView from './views/ResetPasswordView'
import DashboardView from './views/DashboardView'
import AdminView from './views/AdminView'
import { getRole, clearAuthData } from './api/authToken'

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(localStorage.getItem('casebank_token')))
  const [role, setRole] = useState(() => getRole())
  const [mainView, setMainView] = useState('dashboard') // 'dashboard' | 'admin'
  const [view, setView] = useState('login')
  const [resetEmail, setResetEmail] = useState('')
  const [loginNotice, setLoginNotice] = useState(null)

  function goToReset(email) {
    setResetEmail(email)
    setView('reset')
  }

  function goToLoginWithNotice(notice) {
    setLoginNotice(notice)
    setView('login')
  }

  function handleLoginSuccess() {
    setRole(getRole())
    setAuthenticated(true)
  }

  function handleLogout() {
    clearAuthData()
    setAuthenticated(false)
    setRole(0)
    setMainView('dashboard')
    setView('login')
  }

  const isAdmin = role >= 1

  if (authenticated) {
    if (mainView === 'admin' && isAdmin) {
      return <AdminView onLogout={handleLogout} onGoDashboard={() => setMainView('dashboard')} />
    }

    return (
      <DashboardView
        onLogout={handleLogout}
        isAdmin={isAdmin}
        onGoAdmin={() => setMainView('admin')}
      />
    )
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
              onLoginSuccess={handleLoginSuccess}
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
              email={resetEmail}
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