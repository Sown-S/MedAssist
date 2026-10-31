// Đăng nhập / đăng xuất / đổi mật khẩu cho cả hai chế độ. Chạy thật: POST /auth/login lấy token, GET /auth/me lấy
// họ tên và vai trò; khoá khi sai mật khẩu (429) và thu hồi token khi đổi mật khẩu do server làm.
import { apiGet, apiPost, ApiError, DEMO_MODE } from './client'
import { tokenStore } from './serverConfig'
import { verifyLogin, changeOwnPassword } from './accountStore'

const ROLE_OF = { Physician: 'doctor', Nurse: 'reception', Admin: 'admin' }

function errorText(e) {
  if (!(e instanceof ApiError)) return 'Cannot reach the clinic server. Check the server address and the network connection.'
  if (e.code === 'RATE_LIMITED') {
    const s = e.details?.[0]?.retry_after_seconds ?? 60
    return `Too many failed sign-ins. Try again in ${Math.max(1, Math.ceil(s / 60))} minutes.`
  }
  if (e.code === 'UNAUTHORIZED') return 'Incorrect username or password.'
  if (e.code === 'WRONG_PASSWORD') return 'The current password is incorrect.'
  // Lỗi kiểm tra dữ liệu: lấy câu tiếng Việt của server cho đúng ô sai.
  return e.details?.[0]?.message ?? e.message
}

// Trả về cùng dạng với verifyLogin của bản demo.
export async function login(username, password, roleKey) {
  if (DEMO_MODE) return verifyLogin(username, password, roleKey)
  await tokenStore.clear()
  try {
    const t = await apiPost('/api/v1/auth/login', { username: username.trim(), password })
    await tokenStore.set('access', t.access_token)
    await tokenStore.set('refresh', t.refresh_token)
    const me = await apiGet('/api/v1/auth/me')
    const account = {
      id: me.user_id,
      username: me.username,
      fullName: me.full_name,
      roleKey: ROLE_OF[me.role],
      mustChange: !!me.must_change_password,
      roomId: me.room_id ?? null,
      roomCode: me.room_code ?? '',
      roomName: me.room_name ?? ''
    }
    if (account.roleKey !== roleKey) {
      await logout()
      return { ok: false, error: 'This account does not belong to the selected role.' }
    }
    return { ok: true, account }
  } catch (e) {
    await tokenStore.clear()
    return { ok: false, error: errorText(e) }
  }
}

export async function logout() {
  if (DEMO_MODE) return
  try {
    await apiPost('/api/v1/auth/logout')
  } catch {/* token hết hạn hoặc mất mạng: vẫn xoá token trên máy */}
  await tokenStore.clear()
}

// Đổi thành công thì phiên hiện tại hết hiệu lực — nơi gọi phải đưa người dùng về màn đăng nhập.
export async function changePassword(user, oldPassword, newPassword) {
  if (DEMO_MODE) return changeOwnPassword(user.id, newPassword, oldPassword)
  try {
    await apiPost('/api/v1/auth/change-password', { old_password: oldPassword, new_password: newPassword })
  } catch (e) {
    return { ok: false, error: errorText(e) }
  }
  await tokenStore.clear()
  return { ok: true }
}
