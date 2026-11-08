import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { apiGet, ApiError, isServerSlow, setSessionExpiredHandler, setPasswordChangeRequiredHandler } from '../src/renderer/src/api/client.js'
import { tokenStore } from '../src/renderer/src/api/serverConfig.js'
import { login } from '../src/renderer/src/api/authApi.js'

// Phiên đăng nhập: đổi token khi hết hạn, về màn đăng nhập khi refresh cũng hỏng, khoá khi sai nhiều lần,
// bắt đổi mật khẩu, và giới hạn 45 giây chờ server. Mỗi test tự khai server bằng một hàm (path, init) → [status, body].
let handle
let calls
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const error = (status, code, message, details = []) => [status, { error: { code, message, details } }]

beforeEach(() => {
  sessionStorage.clear()
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname
      calls.push({ path, auth: init.headers?.Authorization ?? null, body: init.body ? JSON.parse(init.body) : undefined })
      const [status, body] = await handle(path, init)
      return json(status, body)
    })
  )
  setSessionExpiredHandler(() => {})
  setPasswordChangeRequiredHandler(() => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('Token hết hạn', () => {
  it('401 → đổi bằng refresh token một lần rồi gọi lại, lưu token mới', async () => {
    await tokenStore.set('access', 'old')
    await tokenStore.set('refresh', 'r1')
    handle = (path, init) => {
      if (path === '/api/v1/auth/refresh') return [200, { access_token: 'new', refresh_token: 'r2' }]
      return init.headers.Authorization === 'Bearer new' ? [200, { ok: 1 }] : error(401, 'UNAUTHORIZED', 'Hết hạn')
    }
    expect(await apiGet('/api/v1/queue')).toEqual({ ok: 1 })
    expect(calls.map((c) => c.path)).toEqual(['/api/v1/queue', '/api/v1/auth/refresh', '/api/v1/queue'])
    expect(calls[1].body).toEqual({ refresh_token: 'r1' })
    expect(await tokenStore.get('access')).toBe('new')
    expect(await tokenStore.get('refresh')).toBe('r2')
  })

  it('nhiều lời gọi cùng bị 401 → chỉ refresh một lần', async () => {
    await tokenStore.set('access', 'old')
    await tokenStore.set('refresh', 'r1')
    handle = async (path, init) => {
      if (path === '/api/v1/auth/refresh') return [200, { access_token: 'new' }]
      return init.headers.Authorization === 'Bearer new' ? [200, []] : error(401, 'UNAUTHORIZED', 'Hết hạn')
    }
    await Promise.all([apiGet('/api/v1/queue'), apiGet('/api/v1/drugs'), apiGet('/api/v1/symptoms')])
    expect(calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(1)
  })

  it('refresh cũng hỏng → xoá token trên máy, về màn đăng nhập', async () => {
    await tokenStore.set('access', 'old')
    await tokenStore.set('refresh', 'r1')
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    handle = () => error(401, 'UNAUTHORIZED', 'Hết hạn')
    await expect(apiGet('/api/v1/queue')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(expired).toHaveBeenCalledOnce()
    expect(await tokenStore.get('access')).toBeNull()
    expect(await tokenStore.get('refresh')).toBeNull()
  })

  it('403 PASSWORD_CHANGE_REQUIRED (admin vừa đặt lại mật khẩu) → về màn đổi mật khẩu', async () => {
    const mustChange = vi.fn()
    setPasswordChangeRequiredHandler(mustChange)
    handle = () => error(403, 'PASSWORD_CHANGE_REQUIRED', 'Cần đổi mật khẩu')
    await expect(apiGet('/api/v1/queue')).rejects.toBeInstanceOf(ApiError)
    expect(mustChange).toHaveBeenCalledOnce()
  })
})

describe('Đăng nhập', () => {
  const me = { user_id: 'u1', username: 'bs01', full_name: 'BS Một', role: 'Physician', must_change_password: false, room_id: 'r1', room_code: 'PK01', room_name: 'Phòng khám 01' }

  it('đúng tài khoản → lưu token, trả thông tin người dùng', async () => {
    handle = (path) => (path === '/api/v1/auth/login' ? [200, { access_token: 'a', refresh_token: 'r' }] : [200, me])
    const r = await login(' bs01 ', 'Kiemthu@2026', 'doctor')
    expect(r).toMatchObject({ ok: true, account: { id: 'u1', roleKey: 'doctor', roomName: 'Phòng khám 01', mustChange: false } })
    expect(calls[0].body).toEqual({ username: 'bs01', password: 'Kiemthu@2026' })
    expect(calls[1].auth).toBe('Bearer a')
  })

  it('sai mật khẩu (401 ở /auth/login) → báo sai, không gọi refresh', async () => {
    handle = () => error(401, 'UNAUTHORIZED', 'Sai')
    expect(await login('bs01', 'sai', 'doctor')).toEqual({ ok: false, error: 'Incorrect username or password.' })
    expect(calls.map((c) => c.path)).toEqual(['/api/v1/auth/login'])
  })

  it('sai quá nhiều lần (429) → báo số phút phải chờ theo retry_after_seconds', async () => {
    handle = () => error(429, 'RATE_LIMITED', 'Đăng nhập sai quá nhiều lần', [{ retry_after_seconds: 290 }])
    expect((await login('bs01', 'sai', 'doctor')).error).toBe('Too many failed sign-ins. Try again in 5 minutes.')
  })

  it('tài khoản không thuộc vai trò đã chọn → đăng xuất, xoá token', async () => {
    handle = (path) => (path === '/api/v1/auth/login' ? [200, { access_token: 'a', refresh_token: 'r' }] : path === '/api/v1/auth/me' ? [200, me] : [204])
    expect(await login('bs01', 'Kiemthu@2026', 'admin')).toEqual({ ok: false, error: 'This account does not belong to the selected role.' })
    expect(calls.map((c) => c.path)).toContain('/api/v1/auth/logout')
    expect(await tokenStore.get('access')).toBeNull()
  })

  it('không tới được server → câu hướng dẫn kiểm tra địa chỉ và mạng', async () => {
    handle = () => Promise.reject(new TypeError('Failed to fetch'))
    expect((await login('bs01', 'x', 'doctor')).error).toMatch(/Cannot reach the clinic server/)
  })
})

describe('Server chậm / treo', () => {
  it('quá 10 giây bật cờ “đang chậm”, quá 45 giây báo TIMEOUT và tắt cờ', async () => {
    vi.useFakeTimers()
    // Server không bao giờ trả lời: chỉ dừng khi bị huỷ.
    vi.stubGlobal('fetch', vi.fn((url, init) => new Promise((_, fail) => init.signal.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError'))))))
    const req = apiGet('/api/v1/queue')
    const done = expect(req).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10_001)
    expect(isServerSlow()).toBe(true)
    await vi.advanceTimersByTimeAsync(35_000)
    await done
    expect(isServerSlow()).toBe(false)
  })
})
