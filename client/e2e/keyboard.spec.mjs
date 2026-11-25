// Làm việc bằng bàn phím: phím tắt chung, phím tắt màn hình, di chuyển giữa các dòng của bảng.
import { test, expect, login } from './app.mjs'

test('lễ tân: Alt+số mở mục menu, ↑↓ giữa các dòng bảng, F2 tiếp đón, F1 trợ giúp', async ({ page }) => {
  await login(page, 'nurse')
  await page.keyboard.press('Alt+2')
  await expect(page.locator('.side .nav.on')).toContainText('Hàng chờ')

  // Bảng hàng chờ: đứng ở nút đầu tiên của dòng 1, ↓ sang nút cùng vị trí ở dòng 2.
  const rows = page.locator('table tbody tr').filter({ has: page.locator('button:not([disabled])') })
  test.skip((await rows.count()) < 2, 'cần ít nhất 2 dòng có nút')
  await rows.nth(0).locator('button:not([disabled])').first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1).locator('button:not([disabled])').first()).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(rows.nth(0).locator('button:not([disabled])').first()).toBeFocused()

  await page.keyboard.press('Alt+1')
  await page.keyboard.press('F2')
  await expect(page.locator('.ov.show .modal')).toBeVisible()
  // Đang gõ trong ô: Esc lần đầu chỉ rời ô (không mất dữ liệu đang nhập), lần hai mới đóng.
  await page.keyboard.press('Escape')
  await expect(page.locator('.ov.show .modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.ov.show .modal')).toHaveCount(0)

  await page.keyboard.press('F1')
  await expect(page.locator('.ov.show .modal')).toContainText('Phím tắt')
  await page.keyboard.press('Escape')
})

test('quản trị: Ctrl+N mở form thêm phòng, trợ giúp có phím tắt riêng', async ({ page }) => {
  await login(page, 'admin')
  await page.locator('.side .nav', { hasText: 'Phòng khám' }).first().click()
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+n')
  await expect(page.getByRole('heading', { name: 'Thêm phòng' })).toBeVisible()
  await expect(page.locator('form input').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await page.keyboard.press('F1')
  await expect(page.locator('.ov.show .modal')).toContainText('Thêm mục mới trên trang')
})
