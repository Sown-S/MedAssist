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
import { useServerOnline, useServerSlow } from './api/connectivity'
import { LeaveVisitModal } from './pages/doctor/doctorShared'
import VersionBanners from './components/VersionBanners'

// Tab theo vai trò. Lịch hẹn, sổ quỹ, chốt ca nằm ngoài phạm vi; xét nghiệm làm thủ công nên không có tab Cận lâm sàng.
const TABS = [
  { to: '/reception', icon: 'clipboard', label: 'Reception', allow: ['reception'] },
  { to: '/doctor', icon: 'stethoscope', label: 'Consultation', allow: ['doctor'] },
  { to: '/reports', icon: 'chart', label: 'Reports', allow: ['admin'] },
  { to: '/admin', icon: 'settings', label: 'Admin', allow: ['admin'] },
  // Bác sĩ duyệt tri thức trong khu Admin bằng tài khoản của mình.
  { to: '/admin', icon: 'bulb', label: 'Knowledge review', allow: ['doctor'] }
]

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
