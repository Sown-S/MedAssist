import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// allow: mảng các roleKey được phép vào route này (VD ['doctor']).
// Không dùng "ẩn tab" không thôi — vì người dùng vẫn có thể gõ thẳng URL (kể cả HashRouter),
// nên phải chặn ở tầng route mới coi là RBAC thật.
export default function RequireRole({ allow, children }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (!allow.includes(user.roleKey)) return <Navigate to={user.home} replace />
  return children
}
