import { useState, useSyncExternalStore } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { getRenderKey, subscribe } from './i18n'
import { ToastProvider } from './context/ToastContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AdminNavProvider } from './context/AdminNavContext'
import RequireRole from './components/RequireRole'
import Icon from './components/Icon'
import TopActions from './components/TopActions'
import SideNav, { useCurrentLabel } from './components/SideNav'
import Login from './pages/Login'
import Reception from './pages/Reception'
import Doctor from './pages/Doctor'
import Admin from './pages/Admin'
import Reports from './pages/Reports'
import Modal, { ModalHeader } from './components/Modal'
import ErrorBoundary from './components/ErrorBoundary'
import { useQueue, isMine, inRoom, atLabs } from './api/queueStore'
import { translate } from './i18n'
import { useServerOnline, useServerSlow } from './api/connectivity'
import { LeaveVisitModal } from './pages/doctor/doctorShared'
import VersionBanners from './components/VersionBanners'

// Menu theo vai trò nằm ở components/SideNav.jsx. Lịch hẹn, sổ quỹ, chốt ca nằm ngoài phạm vi.

export function Shell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Bác sĩ đăng xuất mà còn bệnh nhân trong phòng / đang đi xét nghiệm → chặn, liệt kê từng ca để xử lý.
  const [leaving, setLeaving] = useState(false)
  // Bệnh nhân đi xét nghiệm không quay lại: đóng lượt ngay từ hộp thoại đăng xuất.
  const [closing, setClosing] = useState(null)
  const serverOnline = useServerOnline()
  const serverSlow = useServerSlow()
  const { visits } = useQueue()
  if (!user) return <Login />
  const openVisits = user.roleKey === 'doctor' ? visits.filter((v) => (inRoom(v) || atLabs(v)) && isMine(v, user)) : []

  return (
    <AdminNavProvider>
      <ShellLayout user={user} onSignOut={() => (openVisits.length ? setLeaving(true) : logout())}>
      {/* Lễ tân có banner mất kết nối riêng trong trang; các vai trò khác dùng banner chung này. */}
      {!serverOnline && user.roleKey !== 'reception' && (
        <div className="warn-banner show caution" style={{ margin: '12px 24px 0' }}>
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="txt">
            <b>No connection to the clinic server — read-only mode</b>
            <span>Saving is blocked until the connection returns; what is on screen was loaded earlier.</span>
          </div>
        </div>
      )}

      {/* Một yêu cầu chờ quá 10 giây (giới hạn 45 giây) → báo để người dùng biết app không treo. */}
      {serverSlow && serverOnline && (
        <div className="warn-banner show caution" role="status" style={{ margin: '12px 24px 0' }}>
          <div className="icon">
            <Icon name="clock" />
          </div>
          <div className="txt">
            <b>The server is responding slowly — still waiting…</b>
            <span>Your last action is still being processed. If there is no answer after 45 seconds it stops and you can try again.</span>
          </div>
        </div>
      )}

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
        <div className="modal-body">
          <p className="ai-soft" style={{ fontSize: 13.5, marginTop: 0 }}>
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
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => setLeaving(false)}>
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
  return (
    <div className="app-shell">
      <SideNav user={user} />
      <div className="app-main">
        <header className="topbar">
          <h1 className="top-title">{title}</h1>
          <div className="top-actions">
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
