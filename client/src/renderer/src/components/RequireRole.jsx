import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Chặn ở tầng route vì ẩn tab là chưa đủ — người dùng vẫn gõ thẳng URL được.
export default function RequireRole({ allow, children }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (!allow.includes(user.roleKey)) return <Navigate to={user.home} replace />
  return children
}
