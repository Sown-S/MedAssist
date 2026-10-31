import { useState, useSyncExternalStore } from 'react'
import { NavLink, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { getRenderKey, subscribe } from './i18n'
import { ToastProvider } from './context/ToastContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import RequireRole from './components/RequireRole'
import Icon from './components/Icon'
import TopActions from './components/TopActions'
import Login from './pages/Login'
import Reception from './pages/Reception'
import Doctor from './pages/Doctor'
import Admin from './pages/Admin'
import Reports from './pages/Reports'
import Modal, { ModalHeader } from './components/Modal'
import ErrorBoundary from './components/ErrorBoundary'
import { useQueue, isMine, inRoom, atLabs } from './api/queueStore'
import { translate } from './i18n'
import { useServerOnline } from './api/connectivity'

// Tab theo vai trò. Lịch hẹn, sổ quỹ, chốt ca nằm ngoài phạm vi; xét nghiệm làm thủ công nên không có tab Cận lâm sàng.
const TABS = [
  { to: '/reception', icon: 'clipboard', label: 'Reception', allow: ['reception'] },
  { to: '/doctor', icon: 'stethoscope', label: 'Consultation', allow: ['doctor'] },
  { to: '/reports', icon: 'chart', label: 'Reports', allow: ['admin'] },
  { to: '/admin', icon: 'settings', label: 'Admin', allow: ['admin'] },
  // Bác sĩ duyệt tri thức trong khu Admin bằng tài khoản của mình.
  { to: '/admin', icon: 'bulb', label: 'Knowledge review', allow: ['doctor'] }
]

function Shell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Bác sĩ đăng xuất mà còn bệnh nhân trong phòng / đang đi xét nghiệm → nhắc trước.
  const [leaving, setLeaving] = useState(false)
  const serverOnline = useServerOnline()
  const { visits } = useQueue()
  if (!user) return <Login />
  const openVisits = user.roleKey === 'doctor' ? visits.filter((v) => (inRoom(v) || atLabs(v)) && isMine(v, user)) : []

  const visibleTabs = TABS.filter((t) => t.allow.includes(user.roleKey))

  return (
    <div>
      <div className="topbar-1">
        <div className="brand">
          <div className="mark">M</div>
          <span>MedAssist</span>
        </div>
        <div className="role-id">
          <div className="avatar">{user.av}</div>
          <div className="txt">
            <span className="name">{user.name}</span>
            <span className="role">{user.role}</span>
          </div>
        </div>
        <div className="top-actions">
          <TopActions user={user} />
          <button className="logout-btn" onClick={() => (openVisits.length ? setLeaving(true) : logout())}>
            Sign out
          </button>
        </div>
      </div>
      <div className="topbar-2">
        <nav className="tabs">
          {visibleTabs.map((t) => (
            <NavLink key={t.to + t.label} to={t.to} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
              <Icon name={t.icon} />
              {/* NavLink là component nên chuỗi con trực tiếp không được jsx-runtime dịch → bọc <span>. */}
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
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
      <Modal open={leaving} onClose={() => setLeaving(false)}>
        <ModalHeader title={translate('Patients still with you')} onClose={() => setLeaving(false)} />
        <div className="modal-body">
          <p className="ai-soft" style={{ fontSize: 13.5, marginTop: 0 }}>
            Finalize these visits, or use “Return to queue” so another doctor can take them, before signing out.
          </p>
          {openVisits.map((v) => (
            <button
              key={v.id}
              className="alert-row"
              onClick={() => {
                setLeaving(false)
                navigate('/doctor?view=consult&visit=' + v.id)
              }}
            >
              <span className="p-ticket">{String(v.ticket).padStart(3, '0')}</span>
              <span className="alert-txt">
                <b>{v.name}</b>
                <span>{atLabs(v) ? translate('Out for lab tests') : translate('In my room')}</span>
              </span>
              <Icon name="chevronRight" />
            </button>
          ))}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => setLeaving(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setLeaving(false)
              logout()
            }}
          >
            Sign out anyway
          </button>
        </div>
      </Modal>
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
