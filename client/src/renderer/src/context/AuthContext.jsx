import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ROLES } from '../api/accountStore'
import * as authApi from '../api/authApi'
import { setSessionExpiredHandler, setPasswordChangeRequiredHandler } from '../api/client'
import { getSettings } from '../api/settingsStore'

const AuthContext = createContext(null)

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

  // Chưa đặt user ở bước này để còn xử lý bắt buộc đổi mật khẩu. Vai trò lấy từ server, không tin vai trò chọn ở màn
  // đăng nhập; server tự ghi nhật ký đăng nhập.
  function authenticate(username, password, roleKey) {
    return authApi.login(username, password, roleKey)
  }
  function startSession(account) {
    setNotice('')
    setUser(toSessionUser(account))
  }
  function endSession(notice = '') {
    authApi.logout()
    setNotice(notice)
    setUser(null)
  }
  function logout() {
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
