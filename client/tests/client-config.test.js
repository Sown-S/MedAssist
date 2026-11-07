import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Thông tin phòng khám và thời gian tự đăng xuất dùng chung mọi máy: server là nguồn chính (GET /auth/client-config),
// máy giữ bản lấy được gần nhất để in / tự đăng xuất khi mất kết nối. Mỗi test nạp lại settingsStore như lúc mở app.
let handle
let calls
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const CONFIG = {
  clinic: { name: 'Phòng khám An Bình', address: '12 Lê Lợi', phone: '0236', email: '', tax_code: '0401234567', license_no: 'GP-01', license_date: '01/02/2020', license_issuer: 'Sở Y tế Đà Nẵng', director: 'BS. A', director_license: 'CCHN-1', logo: '', print_header: 'Mở cửa 7h–20h', print_footer: '', show_logo: false },
  idle_logout_minutes: 30
}

beforeEach(() => {
  localStorage.clear()
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname
      calls.push({ path, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined })
      const r = await handle(path, init)
      if (!r) throw new TypeError('Failed to fetch')
      return json(...r)
    })
  )
})
afterEach(() => vi.unstubAllGlobals())

async function openApp() {
  vi.resetModules()
  return import('../src/renderer/src/api/settingsStore.js')
}

describe('Cấu hình dùng chung (client-config)', () => {
  it('máy mới chưa từng kết nối: thông tin phòng khám trống, tự đăng xuất 15 phút', async () => {
    handle = () => null
    const s = await openApp()
    expect(await s.loadClientConfig()).toBe(false)
    expect(s.getSettings().clinic.name).toBe('')
    expect(s.getSettings().security.idleMinutes).toBe(15)
    // Chân trang không tự điền câu mặc định: mọi máy in giống nhau theo server.
    expect(s.getSettings().print).toEqual({ showLogo: true, header: '', footer: '' })
  })

  it('đọc từ server rồi dùng bản đệm khi mở lại lúc mất kết nối', async () => {
    handle = (path) => (path === '/api/v1/auth/client-config' ? [200, CONFIG] : null)
    let s = await openApp()
    expect(await s.loadClientConfig()).toBe(true)
    expect(s.getSettings().clinic).toMatchObject({ name: 'Phòng khám An Bình', taxCode: '0401234567', licenseDate: '01/02/2020', directorLicense: 'CCHN-1' })
    expect(s.getSettings().security.idleMinutes).toBe(30)
    expect(s.getSettings().print).toEqual({ showLogo: false, header: 'Mở cửa 7h–20h', footer: '' })

    handle = () => null
    s = await openApp()
    expect(await s.loadClientConfig()).toBe(false)
    expect(s.getSettings().clinic.licenseIssuer).toBe('Sở Y tế Đà Nẵng')
    expect(s.getSettings().print.header).toBe('Mở cửa 7h–20h')
    expect(s.getSettings().security.idleMinutes).toBe(30)
  })

  it('Admin lưu: gửi clinic.profile (kèm tiêu đề, chân trang, logo) dạng snake_case và số phút tự đăng xuất; máy không giữ bản riêng', async () => {
    handle = (path) => (path === '/api/v1/auth/client-config' ? [200, CONFIG] : [200, {}])
    const s = await openApp()
    await s.loadClientConfig()
    const draft = { ...s.getSettings(), clinic: { ...s.getSettings().clinic, director: 'BS. B' }, print: { showLogo: true, header: 'Mở cửa 7h–20h', footer: 'Cảm ơn quý khách' }, security: { idleMinutes: 60 } }
    expect(await s.saveServerSettings(draft)).toEqual({ ok: true })
    const puts = calls.filter((c) => c.method === 'PUT')
    expect(puts.map((c) => c.path)).toEqual(['/api/v1/admin/settings/clinic.profile', '/api/v1/admin/settings/security.idle_logout_minutes'])
    expect(puts[0].body.value).toEqual({ ...CONFIG.clinic, director: 'BS. B', print_footer: 'Cảm ơn quý khách', show_logo: true })
    expect(puts[1].body).toEqual({ value: 60 })

    s.saveSettings({ ...draft, ops: { ...draft.ops, announceName: true } }, { name: 'Admin' })
    const own = JSON.parse(localStorage.getItem('medassist_settings_v1')).values
    expect(own.ops.announceName).toBe(true)
    expect(own.clinic).toBeUndefined()
    expect(own.print).toBeUndefined()
    expect(own.security).toBeUndefined()
  })

  it('server từ chối (422) → báo lỗi của server', async () => {
    handle = (path, init) =>
      init.method === 'PUT' ? [422, { error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: [{ field: 'clinic.profile.logo', message: 'Logo quá lớn' }] } }] : [200, CONFIG]
    const s = await openApp()
    await s.loadClientConfig()
    const draft = { ...s.getSettings(), clinic: { ...s.getSettings().clinic, logo: 'data:image/png;base64,AAAA' } }
    expect(await s.saveServerSettings(draft)).toEqual({ ok: false, error: 'Logo quá lớn' })
  })
})
