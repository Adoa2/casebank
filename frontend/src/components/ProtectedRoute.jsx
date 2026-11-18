// Envuelve rutas privadas: redirige a /login si no hay sesión, o al fallback si el rol no tiene acceso.
import { Navigate, useLocation } from 'react-router-dom'

/** Redirige al fallback si el usuario no está autenticado o no tiene el rol requerido. */
export default function ProtectedRoute({ authenticated, allowed = true, fallback = '/login', children }) {
  const location = useLocation()

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!allowed) {
    return <Navigate to={fallback} replace />
  }

  return children
}