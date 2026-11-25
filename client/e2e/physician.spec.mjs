// Bác sĩ: mời bệnh nhân kế tiếp (hoặc khám tiếp người đang trong phòng), chọn chẩn đoán và hoàn tất khám không kê thuốc.
import { test, expect, login, nav } from './app.mjs'

test('mời bệnh nhân, chẩn đoán và hoàn tất khám', async ({ page }) => {
  await login(page, 'physician')
  await nav(page, 'Khám bệnh & Kê đơn')
  const invite = page.getByRole('button', { name: 'Mời bệnh nhân tiếp theo' }).first()
  await expect(invite).toBeVisible()
  // Thông báo ca cấp cứu mới (nếu có) che một phần màn hình: đóng đi.
  const popup = page.locator('.bp-acts')
  if (await popup.isVisible().catch(() => false)) await popup.getByRole('button', { name: 'Bỏ qua' }).click()

  // Thứ tự: đã có người được mời (thẻ "Đã mời — chờ bệnh nhân vào phòng") thì bắt đầu khám; phòng trống thì mời người kế tiếp.
  const mine = page.locator('.qa-g').first()
  const startExam = page.getByRole('button', { name: 'Bắt đầu khám' })
  if ((await mine.locator('.qi').count()) === 0) {
    if (!(await startExam.isVisible().catch(() => false))) await invite.click()
    await startExam.click()
  }
  await expect(mine.locator('.qi').first()).toBeVisible({ timeout: 20_000 })
  await mine.locator('.qi').first().click()

  await page.getByRole('button', { name: 'Khám bệnh (SOAP)' }).first().click()
  const icd = page.locator('.icd-picker input').first()
  await icd.fill('B5')
  await page.locator('.icd-opt').first().click()
  await expect(icd).toHaveValue(/ — /)

  await page.getByRole('button', { name: 'Hoàn tất khám', exact: true }).first().click()
  const confirm = page.locator('.modal').getByRole('button', { name: /Xác nhận|Hoàn tất/ })
  if (await confirm.first().isVisible().catch(() => false)) await confirm.last().click()
  // Lượt khám rời "Trong phòng tôi".
  await expect(page.locator('.qa-g').first().locator('.qi')).toHaveCount(0, { timeout: 20_000 })
})
