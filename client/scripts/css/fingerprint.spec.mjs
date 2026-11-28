// Dấu vân tay kiểu hiển thị: đi qua các trang của 3 vai trò ở 4 kiểu giao diện, ghi computed style của mọi phần tử.
// Dùng để kiểm một thay đổi CSS "không đổi giao diện": chạy trước và sau, rồi so hai file.
//   FP_OUT=/tmp/a.json npx playwright test --config scripts/css/fingerprint.config.mjs
//   (đổi CSS, build lại)  FP_OUT=/tmp/b.json …  rồi  node scripts/css/fpdiff.mjs /tmp/a.json /tmp/b.json
import { writeFileSync } from 'node:fs'
import { test, login, nav } from '../../e2e/app.mjs'

const PAGES = {
  nurse: ['Trang chủ', 'Hàng chờ', 'Bệnh nhân', 'Cấp phát & thu tiền', 'Hóa đơn', 'Đơn thuốc'],
  physician: ['Trang chủ', 'Khám bệnh & Kê đơn', 'Đơn thuốc'],
  admin: ['Trang chủ', 'Quản lý tài khoản', 'Phòng khám', 'Quản lý danh mục', 'Tồn kho & hạn dùng', 'Cấu hình AI', 'Lịch sử hoạt động', 'Cài đặt']
}
const LOOKS = [
  { accent: 'default', theme: 'light', sidebar: 'light' },
  { accent: 'blue', theme: 'light', sidebar: 'dark' },
  { accent: 'teal', theme: 'dark', sidebar: 'dark' },
  { accent: 'sunset', theme: 'light', sidebar: 'light' }
]
const PROPS = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'background-image', 'border', 'border-radius', 'box-shadow', 'font-size', 'font-weight', 'line-height', 'gap', 'grid-template-columns', 'flex', 'opacity', 'transform', 'filter', 'z-index', 'overflow', 'text-transform', 'letter-spacing']

test.setTimeout(600_000)
test('fingerprint', async ({ page }) => {
  const out = {}
  for (const [role, pages] of Object.entries(PAGES)) {
    await login(page, role)
    for (const p of pages) {
      await nav(page, p)
      await page.waitForTimeout(1200)
      for (const look of LOOKS) {
        out[`${role}/${p}/${look.accent}-${look.theme}-${look.sidebar}`] = await page.evaluate(
          ({ look, PROPS }) => {
            const h = document.documentElement
            h.dataset.accent = look.accent
            h.dataset.theme = look.theme
            h.dataset.sidebar = look.sidebar
            const res = {}
            const path = (el) => {
              const parts = []
              for (let e = el; e && e !== document.body; e = e.parentElement) {
                const i = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0
                parts.unshift(`${e.tagName.toLowerCase()}${e.classList.length ? '.' + [...e.classList].sort().join('.') : ''}:${i}`)
              }
              return parts.join('>')
            }
            for (const el of document.body.querySelectorAll('*')) {
              const cs = getComputedStyle(el)
              res[path(el)] = PROPS.map((k) => cs.getPropertyValue(k)).join('|')
              for (const ps of ['::before', '::after']) {
                const c = getComputedStyle(el, ps)
                if (c.content !== 'none' && c.content !== 'normal') res[path(el) + ps] = PROPS.map((k) => c.getPropertyValue(k)).join('|')
              }
            }
            return res
          },
          { look, PROPS }
        )
      }
    }
  }
  writeFileSync(process.env.FP_OUT ?? 'out/fingerprint.json', JSON.stringify(out))
})
