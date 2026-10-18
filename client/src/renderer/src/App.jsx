import { useState, useSyncExternalStore } from 'react'
import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
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
import ShiftEndModal from './pages/doctor/ShiftEndModal'

// Mỗi tab khai báo sẵn "role nào được thấy nó" — thêm/bớt vai trò sau này chỉ sửa mảng allow.
// Đặt lịch hẹn, sổ quỹ, chốt ca nằm ngoài phạm vi (Proposal §6.2) — Lễ tân chỉ có Tiếp đón (hàng chờ ngay trên trang chủ).
// Xét nghiệm làm thủ công: bác sĩ in phiếu chỉ định ngay trong Phòng khám, không có tab Cận lâm sàng riêng.
const TABS = [
  { to: '/reception', icon: 'clipboard', label: 'Reception', allow: ['reception'] },
  { to: '/doctor', icon: 'stethoscope', label: 'Consultation', allow: ['doctor'] },
  { to: '/reports', icon: 'chart', label: 'Reports', allow: ['admin'] },
  { to: '/admin', icon: 'settings', label: 'Admin', allow: ['admin'] },
  // Bác sĩ duyệt tri thức ngay trong khu Admin bằng tài khoản của mình — chỉ thấy đúng mục này.
  { to: '/admin', icon: 'bulb', label: 'Knowledge review', allow: ['doctor'] }
]

function Shell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  // Bác sĩ bấm Đăng xuất → kiểm tra việc còn dở (bệnh nhân trong phòng, đang đi xét nghiệm, cờ đỏ) trước.
  const [leaving, setLeaving] = useState(false)
  if (!user) return <Login />

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
          <button className="logout-btn" onClick={() => (user.roleKey === 'doctor' ? setLeaving(true) : logout())}>
            Sign out
          </button>
        </div>
      </div>
      <div className="topbar-2">
        <nav className="tabs">
          {visibleTabs.map((t) => (
            <NavLink key={t.to + t.label} to={t.to} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
              <Icon name={t.icon} />
              {/* Bọc trong <span>: NavLink là component nên chuỗi con trực tiếp không qua bước dịch của jsx-runtime. */}
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

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
      {leaving && (
        <ShiftEndModal
          signingOut
          onClose={() => setLeaving(false)}
          onOpenVisit={(id) => {
            setLeaving(false)
            navigate('/doctor?view=consult&visit=' + id)
          }}
          onSignOut={() => {
            setLeaving(false)
            logout()
          }}
        />
      )}
    </div>
  )
}

export default function App() {
  // Đổi ngôn ngữ (hoặc cập nhật vi.js khi chạy dev) → đổi key → dựng lại toàn bộ giao diện (phiên đăng nhập vẫn giữ).
  const lang = useSyncExternalStore(subscribe, getRenderKey)
  return (
    <AuthProvider>
      <ToastProvider>
        <Shell key={lang} />
      </ToastProvider>
    </AuthProvider>
  )
}
