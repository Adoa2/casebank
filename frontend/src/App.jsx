import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, useNavigationType } from 'react-router-dom'
import BrandPanel from './components/BrandPanel'
import ProtectedRoute from './components/ProtectedRoute'
import LoginView from './views/LoginView'
import RegisterView from './views/RegisterView'
import ForgotPasswordView from './views/ForgotPasswordView'
import ResetPasswordView from './views/ResetPasswordView'
import DashboardView from './views/DashboardView'
import AdminView from './views/AdminView'
import { getRole, clearAuthData, UNAUTHORIZED_EVENT } from './api/authToken'
import logoImage from './assets/logo_black.png'

function AuthLayout({ cardClassName, children }) {
  return (
    <div className="grid min-h-screen min-h-dvh grid-cols-1 lg:grid-cols-[57%_43%]">
      <div className="hidden lg:block">
        <BrandPanel />
      </div>

      <div className="auth-stage relative flex min-h-screen min-h-dvh items-center justify-center px-4 py-6 sm:px-8 sm:py-10 lg:px-[clamp(2rem,4vw,4.5rem)]">
        <img src={logoImage} alt="CaseBank" className="absolute left-6 top-6 w-[138px] lg:hidden" />
        <div className={`auth-card w-full ${cardClassName}`}>{children}</div>
      </div>
    </div>
  )
}

function ResetRoute({ onBackToLogin, onReset }) {
  const location = useLocation()
  const email = location.state?.email

  if (!email) {
    return <Navigate to="/forgot" replace />
  }

  return <ResetPasswordView email={email} onBackToLogin={onBackToLogin} onReset={onReset} />
}

function LoginRoute({ authenticated, onLogout, notice, onConsumeNotice, onGoRegister, onGoForgot, onLoginSuccess }) {
  const navigationType = useNavigationType() // 'PUSH' | 'POP' | 'REPLACE'

  useEffect(() => {
    if (authenticated && navigationType === 'POP') {
      onLogout()
    }
  }, [authenticated, navigationType, onLogout])

  if (authenticated) {
    return null
  }

  return (
    <AuthLayout cardClassName="max-w-[510px] lg:min-h-[650px]">
      <LoginView
        notice={notice}
        onConsumeNotice={onConsumeNotice}
        onGoRegister={onGoRegister}
        onGoForgot={onGoForgot}
        onLoginSuccess={onLoginSuccess}
      />
    </AuthLayout>
  )
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(localStorage.getItem('casebank_token')))
  const [role, setRole] = useState(() => getRole())
  const [loginNotice, setLoginNotice] = useState(null)
  const navigate = useNavigate()

  function goToLoginWithNotice(notice) {
    setLoginNotice(notice)
    navigate('/login', { replace: true })
  }

  function handleLoginSuccess() {
    setRole(getRole())
    setAuthenticated(true)
    navigate('/dashboard')
  }

  function handleLogout() {
    clearAuthData()
    setAuthenticated(false)
    setRole(0)
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    function onUnauthorized() {
      setAuthenticated(false)
      setRole(0)
      goToLoginWithNotice({
        text: 'Tu sesión expiró. Por favor, inicia sesión nuevamente.',
        type: 'error',
      })
    }

    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const isAdmin = role >= 1

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginRoute
            authenticated={authenticated}
            onLogout={handleLogout}
            notice={loginNotice}
            onConsumeNotice={() => setLoginNotice(null)}
            onGoRegister={() => navigate('/register')}
            onGoForgot={() => navigate('/forgot')}
            onLoginSuccess={handleLoginSuccess}
          />
        }
      />
      <Route
        path="/register"
        element={
          authenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthLayout cardClassName="!px-7 !py-6 sm:!px-10 sm:!py-8 max-w-[510px]">
              <RegisterView
                onBackToLogin={() => navigate('/login')}
                onRegistered={() =>
                  goToLoginWithNotice({ text: 'Cuenta creada. Ya puedes iniciar sesión.', type: 'success' })
                }
              />
            </AuthLayout>
          )
        }
      />

      <Route
        path="/forgot"
        element={
          authenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthLayout cardClassName="max-w-[510px]">
              <ForgotPasswordView
                onBackToLogin={() => navigate('/login')}
                onCodeSent={(email) => navigate('/reset', { state: { email } })}
              />
            </AuthLayout>
          )
        }
      />

      <Route
        path="/reset"
        element={
          authenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthLayout cardClassName="max-w-[510px]">
              <ResetRoute
                onBackToLogin={() => navigate('/login')}
                onReset={() =>
                  goToLoginWithNotice({ text: 'Contraseña actualizada. Ya puedes iniciar sesión.', type: 'success' })
                }
              />
            </AuthLayout>
          )
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute authenticated={authenticated}>
            <DashboardView onLogout={handleLogout} isAdmin={isAdmin} onGoAdmin={() => navigate('/admin')} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute authenticated={authenticated} allowed={isAdmin} fallback="/dashboard">
            <AdminView onLogout={handleLogout} onGoDashboard={() => navigate('/dashboard')} role={role} />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to={authenticated ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}