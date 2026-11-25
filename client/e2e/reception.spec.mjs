// Lễ tân: đăng ký bệnh nhân mới kèm lượt khám (giới tính bắt buộc chọn, hỏi mang thai theo lượt) rồi thấy trong hàng chờ.
import { test, expect, login, nav, uniqueName } from './app.mjs'

test('đăng ký bệnh nhân mới và cấp số', async ({ page }) => {
  await login(page, 'nurse')
  await page.getByText('Đăng ký bệnh nhân mới').first().click()
  const m = page.locator('.modal').last()
  const name = uniqueName('Nguyễn Thị')
  await m.locator('input').first().fill(name)
  await m.locator('input[placeholder="dd/mm/yyyy"]').first().fill('12/04/1996')
  await m.locator('input[placeholder="09xx xxx xxx"]').fill('09' + String(Date.now()).slice(-8))
  await m.locator('textarea').first().fill('Sốt, đau họng 2 ngày')

  // Chưa chọn giới tính → báo bắt buộc, không lưu.
  await m.getByRole('button', { name: 'Lưu & cấp số' }).click()
  await expect(m.locator('.field.invalid select')).toBeVisible()

  await m.locator('select').first().selectOption('Female')
  await expect(m.getByRole('radiogroup', { name: 'Mang thai' })).toBeVisible()
  await m.getByRole('radio', { name: 'Không mang thai' }).click()
  await m.getByRole('button', { name: 'Lưu & cấp số' }).click()

  // Có thể hiện khung "có thể đã có hồ sơ" nếu trùng số điện thoại cũ: chọn tạo hồ sơ mới.
  const dup = m.getByText('Không phải cùng người')
  if (await dup.isVisible().catch(() => false)) {
    await dup.click()
    await m.getByRole('button', { name: 'Lưu & cấp số' }).click()
  }
  await expect(page.locator('.modal')).toHaveCount(0, { timeout: 20_000 })

  await nav(page, 'Hàng chờ')
  await expect(page.getByText(name).first()).toBeVisible()
})
