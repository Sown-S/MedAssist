// So sánh ảnh chụp các màn ổn định ở các màu phòng khám và giao diện sáng / tối, để phát hiện giao diện bị vỡ.
// Ảnh gốc chụp trên Linux (CI). Đổi giao diện có chủ đích thì chạy lại: xvfb-run -a npx playwright test e2e/visual.spec.mjs --update-snapshots
import { test, expect, login, nav } from './app.mjs'

const LOOKS = [
  { name: 'mac-dinh', accent: 'default', theme: 'light', sidebar: 'light' },
  { name: 'xanh-ngoc-thanh-ben-toi', accent: 'teal', theme: 'light', sidebar: 'dark' },
  { name: 'hoang-hon-giao-dien-toi', accent: 'sunset', theme: 'dark', sidebar: 'dark' }
]
const apply = (page, l) =>
  page.evaluate((l) => {
    const d = document.documentElement
    d.dataset.accent = l.accent
    d.dataset.theme = l.theme
    d.dataset.sidebar = l.sidebar
  }, l)

test('màn đăng nhập', async ({ page }) => {
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  await page.locator('.login-form').waitFor()
  for (const l of LOOKS) {
    await apply(page, l)
    await expect(page).toHaveScreenshot(`dang-nhap-${l.name}.png`)
  }
})

test('trang Phòng khám của Quản trị', async ({ page }) => {
  await login(page, 'admin')
  await nav(page, 'Phòng khám')
  await expect(page.getByRole('button', { name: 'Thêm phòng' })).toBeVisible()
  for (const l of LOOKS) {
    await apply(page, l)
    await expect(page).toHaveScreenshot(`phong-kham-${l.name}.png`, { mask: [page.locator('.sum b')] })
  }
})

test('Cài đặt › Giao diện', async ({ page }) => {
  await login(page, 'admin')
  await page.locator('.top button[aria-label="Cài đặt"]').click()
  const m = page.locator('.modal').last()
  await expect(m).toBeVisible()
  await expect(m).toHaveScreenshot('cai-dat-giao-dien.png')
  await page.keyboard.press('Escape')
})
