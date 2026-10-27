import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ROLES, recordLogin, sessionStillValid } from '../api/accountStore'
import * as authApi from '../api/authApi'
import { DEMO_MODE, setSessionExpiredHandler, setPasswordChangeRequiredHandler } from '../api/client'
import { logEvent } from '../api/activityStore'
import { getSettings } from '../api/settingsStore'

// 3 vai trò theo Proposal (mục 9 — Actors): Bác sĩ, Lễ tân, Quản trị viên.
// Có thể có nhiều tài khoản cùng vai trò (vd. admin 2); tài khoản do Quản trị viên tạo trong màn Quản trị.
const AuthContext = createContext(null)

// Bao lâu kiểm tra lại phiên một lần (bị khoá / vô hiệu hoá / đăng xuất cưỡng bức / đổi vai trò).
const SESSION_CHECK_MS = 5000

export function toSessionUser(account) {
  const r = ROLES[account.roleKey]
  // Avatar = chữ cái đầu của từ đầu + từ cuối trong tên (VD "Trần Minh" → TM).
  const words = account.fullName.trim().split(/\s+/)
  return {
    id: account.id,
    username: account.username,
    roleKey: account.roleKey,
    name: account.fullName,
    role: r.label,
    av: (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0]).toUpperCase(),
    home: r.home,
    sessionVersion: account.sessionVersion ?? 0
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // null = chưa đăng nhập
  const [notice, setNotice] = useState('') // lý do bị đăng xuất, hiện ở màn đăng nhập

  // Bước 1: kiểm tra thông tin. Không đặt user ở đây để còn xử lý "bắt buộc đổi mật khẩu" (mustChange).
  // API thật: vai trò và cờ must_change_password lấy từ server (GET /auth/me), không tin vai trò chọn ở màn đăng nhập.
  async function authenticate(username, password, roleKey) {
    const res = await authApi.login(username, password, roleKey)
    // Nhật ký đăng nhập: bản demo tự ghi; API thật do server ghi (audit_log).
    if (!res.ok && DEMO_MODE)
      logEvent({ name: username.trim() || '?', username: username.trim(), roleKey }, 'auth.login_failed', {
        params: { username: username.trim(), reason: res.error },
        result: 'failure'
      })
    return res
  }
  function startSession(account) {
    const u = toSessionUser(account)
    if (DEMO_MODE) {
      recordLogin(u.id)
      logEvent(u, 'auth.login', { target: { kind: 'account', id: u.username, label: u.name } })
    }
    setNotice('')
    setUser(u)
  }
  // Kết thúc phiên; notice = lý do hiện ở màn đăng nhập (bị đăng xuất tự động, vừa đổi mật khẩu...).
  function endSession(notice = '') {
    authApi.logout()
    setNotice(notice)
    setUser(null)
  }
  function logout() {
    if (user && DEMO_MODE) logEvent(user, 'auth.logout', { target: { kind: 'account', id: user.username, label: user.name } })
    endSession()
  }
  // Đổi mật khẩu thành công: server thu hồi mọi token cũ → về màn đăng nhập, đăng nhập lại bằng mật khẩu mới.
  function signOutAfterPasswordChange() {
    setNotice('Your password was changed. Please sign in again with the new password.')
    setUser(null)
  }
  // Sau khi người dùng tự sửa thông tin của mình (VD đổi họ tên) — cập nhật tên trên thanh trên cùng.
  function refreshUser(account) {
    setUser((u) => (u && u.id === account.id ? { ...toSessionUser(account), sessionVersion: u.sessionVersion } : u))
  }

  // API thật: refresh token cũng bị từ chối (hết 8 giờ, bị vô hiệu hoá, đổi mật khẩu ở máy khác) → về màn đăng nhập.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setNotice('Your session has expired. Please sign in again.')
      setUser(null)
    })
    // Server bắt đổi mật khẩu giữa phiên (vd admin vừa đặt lại) → đăng nhập lại sẽ vào thẳng màn đặt mật khẩu mới.
    setPasswordChangeRequiredHandler(() => endSession('You need to change your password before continuing. Please sign in again.'))
  }, [])

  // Bản demo: không có server từ chối token nên kiểm tra định kỳ trong localStorage.
  useEffect(() => {
    if (!user || !DEMO_MODE) return
    const t = setInterval(() => {
      if (sessionStillValid(user.id, user.sessionVersion)) return
      setNotice('Your session was ended by an administrator. Please sign in again.')
      setUser(null)
    }, SESSION_CHECK_MS)
    return () => clearInterval(t)
  }, [user])

  // Tự đăng xuất khi không thao tác (Cài đặt › Bảo mật) — máy tính phòng khám dùng chung, có dữ liệu bệnh nhân.
  const lastActive = useRef(Date.now())
  useEffect(() => {
    if (!user) return
    lastActive.current = Date.now()
    const touch = () => (lastActive.current = Date.now())
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const t = setInterval(() => {
      const mins = getSettings().security.idleMinutes
      if (!mins || Date.now() - lastActive.current < mins * 60000) return
      if (DEMO_MODE) logEvent(user, 'auth.auto_logout', { target: { kind: 'account', id: user.username, label: user.name }, params: { minutes: mins } })
      endSession(`You were signed out after ${mins} minutes of inactivity.`)
    }, 10000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(t)
    }
  }, [user])

  return (
    <AuthContext.Provider value={{ user, notice, authenticate, startSession, logout, signOutAfterPasswordChange, refreshUser }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
