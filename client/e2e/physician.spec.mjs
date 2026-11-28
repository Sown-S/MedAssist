// Bác sĩ: mời bệnh nhân kế tiếp (hoặc khám tiếp người đang trong phòng), chọn chẩn đoán và hoàn tất khám không kê thuốc.
import { test, expect, login, nav, apiAs } from './app.mjs'

test('mời bệnh nhân, chẩn đoán và hoàn tất khám', async ({ page }) => {
  await login(page, 'physician')
  await nav(page, 'Khám bệnh & Kê đơn')
  const invite = page.getByRole('button', { name: 'Mời bệnh nhân tiếp theo' }).first()
  await expect(invite).toBeVisible()
  // Thông báo ca cấp cứu mới (nếu có) che một phần màn hình: đóng đi.
  // (.bp-acts còn dùng cho thẻ cảnh báo cụm ca bệnh — chỉ bấm nút Bỏ qua của thông báo ca cấp cứu.)
  const dismiss = page.locator('.bp-acts').getByRole('button', { name: 'Bỏ qua', exact: true }).first()
  for (let i = 0; i < 5 && (await dismiss.isVisible().catch(() => false)); i++) await dismiss.click()

  // Thứ tự: đã có người được mời (thẻ "Đã mời — chờ bệnh nhân vào phòng") thì bắt đầu khám; phòng trống thì mời người kế tiếp.
  const mine = page.locator('.qa-g').first()
  const startExam = page.getByRole('button', { name: 'Bắt đầu khám' })
  if ((await mine.locator('.qi').count()) === 0) {
    if (!(await startExam.isVisible().catch(() => false))) await invite.click()
    await expect(startExam).toBeVisible()
    // Server có thể mời người chưa check-in (đã cấp số, chưa có mặt ở quầy) — nút Bắt đầu khám bị khoá tới khi lễ tân
    // check-in. Làm thay lễ tân qua API rồi tiếp tục như ở phòng khám thật.
    if (await startExam.isDisabled()) {
      const desk = await apiAs('nurse')
      const called = (await desk.get('/api/v1/queue')).find((v) => v.status === 'Waiting' && v.called_at && v.called_by_name)
      if (called) await desk.patch(`/api/v1/visits/${called.visit_id}/check-in`)
      await desk.dispose()
    }
    await startExam.click({ timeout: 15_000 })
  }
  await expect(mine.locator('.qi').first()).toBeVisible({ timeout: 20_000 })
  await mine.locator('.qi').first().click()

  // Đo lại sinh hiệu trong phòng: Lưu sinh hiệu → máy chủ tính lại mức ưu tiên ngay (không chờ chốt đơn).
  // SpO2 88% là cờ đỏ; trả về 98% rồi lưu lại (bệnh nhân mời vào có thể đã là ca cấp cứu vì triệu chứng → chỉ kiểm thông báo).
  await page.getByRole('button', { name: 'Sinh hiệu', exact: true }).click()
  const save = page.getByRole('button', { name: 'Lưu sinh hiệu' })
  await expect(save).toBeDisabled()
  await page.locator('#v-spo2_pct').fill('88')
  await save.click()
  await expect(page.locator('.toast').filter({ hasText: 'Đã lưu sinh hiệu · Cấp cứu' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.ch h2').getByText('Cấp cứu')).toBeVisible({ timeout: 10_000 })
  await expect(save).toBeDisabled()
  await page.locator('#v-spo2_pct').fill('98')
  await save.click()
  await expect(page.locator('.toast').filter({ hasText: /^Đã lưu sinh hiệu/ }).last()).toBeVisible({ timeout: 10_000 })
  await expect(save).toBeDisabled()

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
