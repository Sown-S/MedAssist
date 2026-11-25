// CSP chặt (không 'unsafe-inline'): không trang nào bị chặn style/script, và phiếu in vẫn có định dạng (CSS nạp bằng
// CSSStyleSheet dựng sẵn thay cho thẻ <style>).
import { test, expect, login, nav } from './app.mjs'

test('không vi phạm CSP và trang in thử có CSS', async ({ page }) => {
  const violations = []
  page.on('console', (m) => /Content Security Policy|Refused to (apply|load|execute)/.test(m.text()) && violations.push(m.text()))
  await login(page, 'admin')
  for (const p of ['Phòng khám', 'Quản lý tài khoản', 'Tồn kho & hạn dùng', 'Lịch sử hoạt động', 'Cài đặt']) await nav(page, p)
  await page.getByRole('button', { name: /In ấn & đánh số/ }).click()
  // Ghi lại iframe in: thay print() để không mở hộp thoại, đo kiểu chữ tiêu đề sau khi CSS được gắn.
  await page.evaluate(() => {
    window.__print = null
    new MutationObserver((ms) => {
      for (const m of ms)
        for (const n of m.addedNodes)
          if (n.tagName === 'IFRAME')
            n.contentWindow.print = () => {
              const d = n.contentDocument
              const h1 = d.querySelector('h1')
              window.__print = { sheets: d.adoptedStyleSheets.length, h1: h1 && getComputedStyle(h1).fontSize, body: getComputedStyle(d.body).fontFamily }
            }
    }).observe(document.body, { childList: true })
  })
  await page.getByTitle('In trang thử').first().click()
  await expect.poll(() => page.evaluate(() => window.__print ?? null), { timeout: 5000 }).not.toBe(null)
  const pr = await page.evaluate(() => window.__print)
  expect(pr.sheets).toBe(1)
  expect(pr.h1).not.toBe('32px') // cỡ mặc định của trình duyệt cho h1 — CSS in đã áp
  expect(pr.body).toMatch(/Be Vietnam Pro/)
  expect(violations).toEqual([])
})
