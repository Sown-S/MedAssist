// Ngân sách hiệu năng: mở mỗi trang chính không có tác vụ chặn luồng giao diện quá 300 ms (long task) và DOM dưới
// 3000 phần tử. Đo hiện tại (11/2026): không long task nào > 50 ms, trang lớn nhất ~900 phần tử — danh sách dài đều
// đã phân trang nên chưa cần danh sách ảo (virtual list).
import { test, expect, login, nav } from './app.mjs'

const PAGES = {
  nurse: ['Hàng chờ', 'Bệnh nhân', 'Cấp phát & thu tiền', 'Hóa đơn', 'Đơn thuốc'],
  physician: ['Khám bệnh & Kê đơn', 'Tủ thuốc'],
  admin: ['Quản lý danh mục', 'Tồn kho & hạn dùng', 'Cấu hình AI', 'Lịch sử hoạt động']
}
for (const [role, pages] of Object.entries(PAGES))
  test(`trang của ${role} trong ngân sách`, async ({ page }) => {
    await login(page, role)
    for (const p of pages) {
      await page.evaluate(() => {
        window.__longest = 0
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__longest = Math.max(window.__longest, e.duration)))).observe({ type: 'longtask' })
      })
      await nav(page, p)
      await page.waitForTimeout(800)
      const r = await page.evaluate(() => ({ longest: Math.round(window.__longest), nodes: document.querySelectorAll('*').length }))
      expect(r.longest, `${p}: long task`).toBeLessThan(300)
      expect(r.nodes, `${p}: số phần tử DOM`).toBeLessThan(3000)
    }
  })
