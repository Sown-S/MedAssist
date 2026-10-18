import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ROLES, verifyLogin, recordLogin, sessionStillValid } from '../api/accountStore'
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

  // Bước 1: kiểm tra thông tin. Không đặt user ở đây để còn xử lý "bắt buộc đổi mật khẩu".
  async function authenticate(username, password, roleKey) {
    // TODO backend thật: POST /auth/login → JWT + role từ server (không tin role chọn ở client).
    const res = await verifyLogin(username, password, roleKey)
    if (!res.ok)
      logEvent({ name: username.trim() || '?', username: username.trim(), roleKey }, 'auth.login_failed', {
        params: { username: username.trim(), reason: res.error },
        result: 'failure'
      })
    return res
  }
  function startSession(account) {
    const u = toSessionUser(account)
    recordLogin(u.id)
    logEvent(u, 'auth.login', { target: { kind: 'account', id: u.username, label: u.name } })
    setNotice('')
    setUser(u)
  }
  function logout() {
    if (user) logEvent(user, 'auth.logout', { target: { kind: 'account', id: user.username, label: user.name } })
    setUser(null)
  }
  // Sau khi người dùng tự sửa thông tin của mình (VD đổi họ tên) — cập nhật tên trên thanh trên cùng.
  function refreshUser(account) {
    setUser((u) => (u && u.id === account.id ? { ...toSessionUser(account), sessionVersion: u.sessionVersion } : u))
  }

  // Bản thật: server từ chối token cũ → client nhận 401 và về màn đăng nhập. Ở đây kiểm tra định kỳ.
  useEffect(() => {
    if (!user) return
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
      logEvent(user, 'auth.auto_logout', { target: { kind: 'account', id: user.username, label: user.name }, params: { minutes: mins } })
      setNotice(`You were signed out after ${mins} minutes of inactivity.`)
      setUser(null)
    }, 10000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(t)
    }
  }, [user])

  return (
    <AuthContext.Provider value={{ user, notice, authenticate, startSession, logout, refreshUser }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
