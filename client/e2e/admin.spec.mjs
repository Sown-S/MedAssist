// Quản trị: bảng điều khiển, phòng khám, đổi màu phòng khám trong Cài đặt.
import { test, expect, login, nav } from './app.mjs'

test('xem phòng khám và đổi màu phòng khám', async ({ page }) => {
  await login(page, 'admin')
  await nav(page, 'Phòng khám')
  await expect(page.getByRole('button', { name: 'Thêm phòng' })).toBeVisible()

  await page.locator('.top button[aria-label="Cài đặt"]').click()
  const m = page.locator('.modal').last()
  await m.getByRole('radio', { name: /Xanh ngọc/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal')
  await m.getByRole('radio', { name: /Mặc định/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'default')
})
