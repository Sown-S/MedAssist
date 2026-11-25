// Khả năng tiếp cận (WCAG 2.1 AA) bằng axe-core: không vi phạm trên các trang chính, giao diện sáng và tối.
// Chạy axe bằng page.evaluate (đi qua CDP nên CSP của app không chặn); bỏ qua iframe in (không hiển thị).
import { test, expect, login, nav } from './app.mjs'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const PAGES = {
  nurse: ['Trang chủ', 'Hàng chờ', 'Bệnh nhân', 'Cấp phát & thu tiền', 'Hóa đơn', 'Đơn thuốc'],
  physician: ['Trang chủ', 'Khám bệnh & Kê đơn', 'Tủ thuốc'],
  admin: ['Trang chủ', 'Quản lý tài khoản', 'Phòng khám', 'Tồn kho & hạn dùng', 'Cấu hình AI', 'Lịch sử hoạt động', 'Cài đặt']
}

async function audit(page, theme) {
  await page.evaluate(AXE)
  return page.evaluate(async (theme) => {
    document.documentElement.dataset.theme = theme
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })
    return r.violations.flatMap((v) => v.nodes.slice(0, 3).map((n) => `${v.id}: ${n.target.join(' ')} — ${(n.any[0]?.message ?? '').slice(0, 120)}`))
  }, theme)
}

test.setTimeout(180_000)
test('màn đăng nhập', async ({ page }) => {
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  await page.locator('.login-form').waitFor()
  for (const theme of ['light', 'dark']) expect(await audit(page, theme), theme).toEqual([])
})
for (const [role, pages] of Object.entries(PAGES))
  test(`trang của ${role}`, async ({ page }) => {
    await login(page, role)
    const found = []
    for (const p of pages) {
      await nav(page, p)
      await page.waitForTimeout(600)
      for (const theme of ['light', 'dark']) found.push(...(await audit(page, theme)).map((x) => `${p} (${theme}) ${x}`))
    }
    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
    expect(found).toEqual([])
  })
