import { useState, useSyncExternalStore } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { getRenderKey, subscribe } from './i18n'
import { ToastProvider } from './context/ToastContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AdminNavProvider } from './context/AdminNavContext'
import RequireRole from './components/RequireRole'
import Icon from './components/Icon'
import TopActions from './components/TopActions'
import SideNav, { useCurrentLabel, useSideCollapsed } from './components/SideNav'
import Login from './pages/Login'
import Reception from './pages/Reception'
import Doctor from './pages/Doctor'
import Admin from './pages/Admin'
import Reports from './pages/Reports'
import Modal, { ModalHeader } from './components/Modal'
import ErrorBoundary from './components/ErrorBoundary'
import { useQueue, isMine, inRoom, atLabs } from './api/queueStore'
import { translate } from './i18n'
import { OfflineBanner, TopProgress, SlowNotice } from './components/NetStatus'
import { LeaveVisitModal } from './pages/doctor/doctorShared'
import VersionBanners from './components/VersionBanners'
import useGlobalKeys from './components/useGlobalKeys'

// Menu theo vai trò nằm ở components/SideNav.jsx. Lịch hẹn, sổ quỹ, chốt ca nằm ngoài phạm vi.

export function Shell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Bác sĩ đăng xuất mà còn bệnh nhân trong phòng / đang đi xét nghiệm → chặn, liệt kê từng ca để xử lý.
  const [leaving, setLeaving] = useState(false)
  // Bệnh nhân đi xét nghiệm không quay lại: đóng lượt ngay từ hộp thoại đăng xuất.
  const [closing, setClosing] = useState(null)
  const { visits } = useQueue()
  if (!user) return <Login />
  const openVisits = user.roleKey === 'doctor' ? visits.filter((v) => (inRoom(v) || atLabs(v)) && isMine(v, user)) : []

  return (
    <AdminNavProvider>
      <ShellLayout user={user} onSignOut={() => (openVisits.length ? setLeaving(true) : logout())}>
      {/* Lễ tân có banner mất kết nối riêng trong trang (kèm danh sách thao tác bị khoá); các vai trò khác dùng banner chung này. */}
      {user.roleKey !== 'reception' && <OfflineBanner style={{ margin: '12px 24px 0' }} />}
      <TopProgress />
      <SlowNotice />

      <VersionBanners />

      {/* Lỗi trong một trang chỉ thay trang đó; thanh trên vẫn dùng được, đổi trang là dựng lại. */}
      <ErrorBoundary resetKey={location.pathname + location.search}>
        <Routes>
          <Route path="/" element={<Navigate to={user.home} replace />} />
          <Route path="/login" element={<Navigate to={user.home} replace />} />
          <Route
            path="/reception"
            element={
              <RequireRole allow={['reception']}>
                <Reception />
              </RequireRole>
            }
          />
          <Route
            path="/doctor"
            element={
              <RequireRole allow={['doctor']}>
                <Doctor />
              </RequireRole>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireRole allow={['admin']}>
                <Reports />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireRole allow={['admin', 'doctor']}>
                <Admin />
              </RequireRole>
            }
          />
        </Routes>
      </ErrorBoundary>
      </ShellLayout>
      {/* Còn ca đã nhận thì không đăng xuất được: xong ca nào thì ca đó biến khỏi danh sách, hết ca mới mở nút. */}
      <Modal open={leaving} onClose={() => setLeaving(false)}>
        <ModalHeader title={translate('Finish your visits before signing out')} onClose={() => setLeaving(false)} />
        <div className="modal-b">
          <p className="muted small" style={{ marginTop: 0 }}>
            {openVisits.length
              ? translate('You still have patients you took. Finalize each visit, return the patient to the queue, or close the visit if the patient left — then you can sign out.')
              : translate('All your visits are finished. Your unsaved notes on this computer will be deleted when you sign out.')}
          </p>
          {openVisits.map((v) => (
            <div key={v.id} className="signout-row">
              <span className="p-ticket">{String(v.ticket).padStart(3, '0')}</span>
              <span className="alert-txt">
                <b>{v.name}</b>
                <span>{atLabs(v) ? translate('Out for lab tests') : translate('In my room')}</span>
              </span>
              {atLabs(v) ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setLeaving(false)
                    setClosing(v)
                  }}
                >
                  Did not come back
                </button>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setLeaving(false)
                    navigate('/doctor?view=consult&visit=' + v.id)
                  }}
                >
                  Open visit <Icon name="chevronRight" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="modal-f">
          <button className="btn btn-outline" onClick={() => setLeaving(false)}>
            Close
          </button>
          <button
            className="btn btn-primary"
            disabled={openVisits.length > 0}
            title={openVisits.length ? translate('Finish your visits first') : undefined}
            onClick={() => {
              setLeaving(false)
              logout()
            }}
          >
            Sign out
          </button>
        </div>
      </Modal>
      {closing && (
        <LeaveVisitModal
          visit={closing}
          onClose={() => {
            setClosing(null)
            setLeaving(true)
          }}
          onDone={() => {
            setClosing(null)
            setLeaving(true)
          }}
        />
      )}
    </AdminNavProvider>
  )
}

// Khung giao diện: menu bên trái + thanh trên cùng (tiêu đề mục đang mở, thông báo, ngôn ngữ, trợ giúp, cài đặt, tài khoản).
function ShellLayout({ user, onSignOut, children }) {
  const title = useCurrentLabel(user)
  const [collapsed, setCollapsed] = useSideCollapsed()
  useGlobalKeys({ onToggleSidebar: () => setCollapsed((v) => !v) })
  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <SideNav user={user} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="main">
        <header className="top">
          <div className="ttl">
            <h1>{title}</h1>
          </div>
          <div className="top-r">
            <TopActions user={user} onSignOut={onSignOut} />
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

export default function App() {
  // Đổi ngôn ngữ → đổi key → dựng lại toàn bộ giao diện (phiên đăng nhập vẫn giữ).
  const lang = useSyncExternalStore(subscribe, getRenderKey)
  return (
    <AuthProvider>
      <ToastProvider>
        <ErrorBoundary>
          <Shell key={lang} />
        </ErrorBoundary>
      </ToastProvider>
    </AuthProvider>
  )
}
