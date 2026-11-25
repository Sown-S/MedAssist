// Form theo mẫu react-hook-form + zod (Đổi mật khẩu): lỗi hiện dưới từng ô bằng tiếng Việt, không gửi lên server.
import { test, expect, login } from './app.mjs'

test('đổi mật khẩu: kiểm dữ liệu ngay tại ô nhập', async ({ page }) => {
  await login(page, 'nurse')
  await page.locator('.top button[aria-label="Cài đặt"]').click()
  const settings = page.locator('.modal').last()
  const tab = settings.getByRole('tab', { name: /Tài khoản/ })
  if (await tab.isVisible().catch(() => false)) await tab.click()
  await settings.getByRole('button', { name: 'Đổi mật khẩu' }).click()
  const m = page.locator('.modal', { hasText: 'Đổi mật khẩu của bạn' }).last()
  await m.getByRole('button', { name: 'Đổi mật khẩu' }).click()
  await expect(m.getByText('Nhập mật khẩu hiện tại.')).toBeVisible()
  await expect(m.getByLabel('Mật khẩu hiện tại')).toHaveAttribute('aria-invalid', 'true')
  await m.getByLabel('Mật khẩu hiện tại').fill('x')
  await m.getByLabel(/^Mật khẩu mới/).fill('Kiemthu@2027')
  await m.getByLabel('Nhập lại mật khẩu mới').fill('Kiemthu@2028')
  await m.getByRole('button', { name: 'Đổi mật khẩu' }).click()
  await expect(m.getByText('Hai mật khẩu mới không khớp.')).toBeVisible()
  await expect(m.getByText('Nhập mật khẩu hiện tại.')).toHaveCount(0)
  await m.getByRole('button', { name: 'Huỷ' }).click()
})
