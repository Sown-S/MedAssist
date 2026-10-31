import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ROLES, recordLogin, sessionStillValid } from '../api/accountStore'
import * as authApi from '../api/authApi'
import { DEMO_MODE, setSessionExpiredHandler, setPasswordChangeRequiredHandler } from '../api/client'
import { logEvent } from '../api/activityStore'
import { getSettings } from '../api/settingsStore'

const AuthContext = createContext(null)

// Chu kỳ kiểm tra lại phiên (bản demo).
const SESSION_CHECK_MS = 5000

export function toSessionUser(account) {
  const r = ROLES[account.roleKey]
  const words = account.fullName.trim().split(/\s+/)
  return {
    id: account.id,
    username: account.username,
    roleKey: account.roleKey,
    name: account.fullName,
    role: r.label,
    av: (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0]).toUpperCase(),
    home: r.home,
    // Phòng khám cố định của bác sĩ ('' = chưa gán) — để lễ tân hướng bệnh nhân đúng phòng.
    roomId: account.roomId ?? null,
    room: account.roomName ?? '',
    sessionVersion: account.sessionVersion ?? 0
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [notice, setNotice] = useState('') // lý do bị đăng xuất, hiện ở màn đăng nhập

  // Chưa đặt user ở bước này để còn xử lý bắt buộc đổi mật khẩu. Chạy thật: vai trò lấy từ server,
  // không tin vai trò chọn ở màn đăng nhập.
  async function authenticate(username, password, roleKey) {
    const res = await authApi.login(username, password, roleKey)
    // Chạy thật: server tự ghi nhật ký đăng nhập.
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
  function endSession(notice = '') {
    authApi.logout()
    setNotice(notice)
    setUser(null)
  }
  function logout() {
    if (user && DEMO_MODE) logEvent(user, 'auth.logout', { target: { kind: 'account', id: user.username, label: user.name } })
    endSession()
  }
  function signOutAfterPasswordChange() {
    setNotice('Your password was changed. Please sign in again with the new password.')
    setUser(null)
  }
  function refreshUser(account) {
    setUser((u) => (u && u.id === account.id ? { ...toSessionUser(account), sessionVersion: u.sessionVersion } : u))
  }

  // Refresh token bị từ chối (hết hạn, bị vô hiệu hoá, đổi mật khẩu ở máy khác) → về màn đăng nhập.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setNotice('Your session has expired. Please sign in again.')
      setUser(null)
    })
    // Server bắt đổi mật khẩu giữa phiên → đăng nhập lại sẽ vào thẳng màn đặt mật khẩu mới.
    setPasswordChangeRequiredHandler(() => endSession('You need to change your password before continuing. Please sign in again.'))
  }, [])

  // Bản demo không có server từ chối token nên kiểm tra định kỳ trong localStorage.
  useEffect(() => {
    if (!user || !DEMO_MODE) return
    const t = setInterval(() => {
      if (sessionStillValid(user.id, user.sessionVersion)) return
      setNotice('Your session was ended by an administrator. Please sign in again.')
      setUser(null)
    }, SESSION_CHECK_MS)
    return () => clearInterval(t)
  }, [user])

  // Tự đăng xuất khi không thao tác — máy phòng khám dùng chung, có dữ liệu bệnh nhân.
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
