import { useEffect } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../src/renderer/src/i18n/index.js'
import { AuthProvider, useAuth } from '../src/renderer/src/context/AuthContext.jsx'
import { ToastProvider } from '../src/renderer/src/context/ToastContext.jsx'
import ErrorBoundary from '../src/renderer/src/components/ErrorBoundary.jsx'

// Dựng một trang như trong app: đã đăng nhập bằng `user`, đứng ở `path`, bọc ErrorBoundary như App.jsx
// để trang lỗi lúc dựng hiện thông báo cho test bắt được.
function SignedIn({ user, children }) {
  const { user: current, startSession } = useAuth()
  useEffect(() => {
    startSession({ id: user.id, username: user.username ?? user.id, roleKey: user.roleKey, fullName: user.name, roomName: user.room ?? '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return current ? children : null
}

export function renderPage(ui, { user, path = '/' }) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ToastProvider>
          <SignedIn user={user}>
            <ErrorBoundary>{ui}</ErrorBoundary>
          </SignedIn>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}
