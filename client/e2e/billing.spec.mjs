// Lễ tân cấp phát và thu tiền một lượt đã khám xong (dữ liệu kiểm thử có người chờ ở quầy).
import { test, expect, login, nav } from './app.mjs'

test('cấp hết thuốc và thu tiền mặt', async ({ page }) => {
  await login(page, 'nurse')
  await nav(page, 'Cấp phát & thu tiền')
  // Chọn dòng còn "Chưa thanh toán" (dòng đã thu nhưng chưa cấp hết thuốc vẫn nằm trong danh sách).
  const row = page.locator('table tr', { hasText: 'Chưa thanh toán' }).getByRole('button', { name: 'Cấp phát & thu tiền' }).first()
  const has = await row.waitFor({ timeout: 8000 }).then(() => true, () => false)
  test.skip(!has, 'không còn lượt chờ ở quầy trong dữ liệu')
  await row.click()
  const m = page.locator('.modal').last()
  const dispenseAll = m.getByRole('button', { name: 'Cấp hết' })
  if (await dispenseAll.isVisible().catch(() => false)) await dispenseAll.click()
  await m.getByRole('tab', { name: /Hoá đơn/ }).or(m.getByRole('button', { name: /Hoá đơn & thanh toán/ })).first().click()
  await m.getByRole('button', { name: 'Tiền mặt' }).click()
  await m.getByRole('button', { name: 'Thu tiền', exact: true }).click()
  const ok = page.locator('.modal').last().getByRole('button', { name: /Xác nhận|Đã nhận/ })
  if (await ok.first().isVisible().catch(() => false)) await ok.first().click()
  await expect(m.getByText(/Đã thanh toán|Đã thu/).first()).toBeVisible({ timeout: 20_000 })
})
