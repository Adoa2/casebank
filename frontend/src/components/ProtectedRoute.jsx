import { Navigate, useLocation } from 'react-router-dom'

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