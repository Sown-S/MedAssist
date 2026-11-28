// Mở ứng dụng Electron đã build (out/) cho test đầu cuối và các thao tác dùng chung.
import { test as base, expect, _electron as electron, request as playwrightRequest } from '@playwright/test'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronBin = createRequire(import.meta.url)('electron')
export const PASSWORD = process.env.E2E_PASSWORD || 'Kiemthu@2026'
export const ROLES = {
  nurse: { label: 'Lễ tân', user: 'letan01' },
  physician: { label: 'Bác sĩ', user: 'bs01' },
  admin: { label: 'Quản trị viên', user: 'admin' }
}

// Mỗi file test một cửa sổ ứng dụng (mở Electron tốn vài giây); trước mỗi test đăng xuất bằng cách xoá phiên.
export const test = base.extend({
  app: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const app = await electron.launch({
        executablePath: electronBin,
        args: [ROOT, '--no-sandbox'],
        env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
      })
      await use(app)
      await app.close()
    },
    { scope: 'worker' }
  ],
  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    // Không mở hộp thoại in thật (phiếu số, hoá đơn, đơn thuốc in qua iframe ẩn); tắt hiệu ứng cho ổn định.
    await page.addInitScript(() => {
      window.print = () => {}
      try {
        localStorage.setItem('medassist_motion', 'reduce')
      } catch {
        /* chưa có localStorage */
      }
    })
    // Bản eval kiểm hình dạng response bằng zod (api/validate.js): lệch hợp đồng là lỗi của lần chạy.
    const drift = []
    const onConsole = (m) => m.type() === 'warning' && m.text().startsWith('[api]') && drift.push(m.text())
    page.on('console', onConsole)
    await use(page)
    page.off('console', onConsole)
    expect(drift, 'response lệch hợp đồng API').toEqual([])
  }
})
export { expect }

// Gọi thẳng API server (chuẩn bị dữ liệu mà giao diện vai trò khác mới làm được, vd lễ tân check-in người bác sĩ vừa mời).
export const API_BASE = process.env.E2E_API_BASE ?? 'http://127.0.0.1:8000'
export async function apiAs(role) {
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE })
  const r = await ctx.post('/api/v1/auth/login', { data: { username: ROLES[role].user, password: PASSWORD } })
  const { access_token } = await r.json()
  const headers = { Authorization: `Bearer ${access_token}` }
  return {
    get: async (path) => (await ctx.get(path, { headers })).json(),
    patch: (path, data) => ctx.patch(path, { headers, data }),
    post: (path, data) => ctx.post(path, { headers, data }),
    dispose: () => ctx.dispose()
  }
}

// Đăng nhập theo vai trò từ màn đăng nhập (xoá phiên cũ trước).
export async function login(page, role) {
  const r = ROLES[role]
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.setItem('medassist_motion', 'reduce')
  })
  await page.reload()
  await page.locator('.login-form').waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: r.label, exact: true }).first().click()
  await page.locator('.login-form input').first().fill(r.user)
  await page.locator('.login-form input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).last().click()
  await expect(page.locator('.side')).toBeVisible({ timeout: 20_000 })
  // Hộp nhắc (đổi mật khẩu, thông báo phiên bản…) nếu có thì đóng.
  await page.keyboard.press('Escape')
}

export async function nav(page, text) {
  await page.locator('.side .nav', { hasText: text }).first().click()
  await page.waitForLoadState('domcontentloaded')
}

// Tên bệnh nhân không trùng giữa các lần chạy.
export const uniqueName = (prefix) => `${prefix} E2E ${Date.now().toString().slice(-6)}`
