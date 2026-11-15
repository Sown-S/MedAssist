import { createContext, useContext, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Modal, { ModalHeader } from '../components/Modal'

// Trang đang mở trong khu Quản trị. Đặt ở trên Shell để thanh menu bên trái (dùng chung mọi vai trò) điều hướng được,
// vẫn giữ cơ chế hỏi trước khi rời trang có thay đổi chưa lưu như trước.
const AdminNavContext = createContext(null)

export function AdminNavProvider({ children }) {
  const [page, setPage] = useState('dash')
  const [params, setParams] = useState(null)
  const leaveGuard = useRef(null)
  const [pendingNav, setPendingNav] = useState(null)
  const routerNavigate = useNavigate()
  const location = useLocation()

  // 'reports' là trang riêng (/reports); các mục còn lại nằm trong /admin.
  function go(id, p = null) {
    leaveGuard.current = null
    setPendingNav(null)
    if (id === 'reports') return routerNavigate('/reports')
    setPage(id)
    setParams(p)
    if (location.pathname !== '/admin') routerNavigate('/admin')
  }
  function navigate(id, p = null) {
    if (leaveGuard.current?.()) return setPendingNav({ id, p })
    go(id, p)
  }
  const value = { page: location.pathname === '/reports' ? 'reports' : page, params, navigate, setLeaveGuard: (fn) => (leaveGuard.current = fn) }

  return (
    <AdminNavContext.Provider value={value}>
      {children}
      <Modal open={!!pendingNav} onClose={() => setPendingNav(null)}>
        <ModalHeader title="Unsaved changes" onClose={() => setPendingNav(null)} />
        <div className="modal-b">
          <p className="ai-soft">You have changes that have not been saved. Leave this page and discard them?</p>
        </div>
        <div className="modal-f">
          <button className="btn btn-outline" onClick={() => setPendingNav(null)}>
            Stay on this page
          </button>
          <button className="btn btn-danger" onClick={() => go(pendingNav.id, pendingNav.p)}>
            Discard &amp; leave
          </button>
        </div>
      </Modal>
    </AdminNavContext.Provider>
  )
}

// Ngoài Provider (vd test render riêng trang Admin) thì tự giữ trang đang mở tại chỗ.
export function useAdminNav() {
  const ctx = useContext(AdminNavContext)
  const [page, setPage] = useState('dash')
  const [params, setParams] = useState(null)
  const guard = useRef(null)
  if (ctx) return ctx
  return {
    page,
    params,
    navigate: (id, p = null) => {
      guard.current = null
      setPage(id)
      setParams(p)
    },
    setLeaveGuard: (fn) => (guard.current = fn)
  }
}
