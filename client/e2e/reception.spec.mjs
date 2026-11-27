// Lễ tân: đăng ký bệnh nhân mới kèm lượt khám (giới tính bắt buộc chọn, hỏi mang thai theo lượt) rồi thấy trong hàng chờ.
import { test, expect, login, nav, uniqueName, apiAs } from './app.mjs'

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

// Gõ nhầm sinh hiệu ở quầy làm bật Cấp cứu (lưu thường chỉ nâng mức) → sửa lại rồi "Đánh giá lại, cho phép hạ mức".
test('lễ tân sửa sinh hiệu gõ nhầm và đánh giá lại cho phép hạ mức', async ({ page }) => {
  const desk = await apiAs('nurse')
  const name = 'Thử Hạ Mức ' + String(Date.now()).slice(-5)
  const p = await (await desk.post('/api/v1/patients', { full_name: name, date_of_birth: '1990-03-02', gender: 'Male', confirm_duplicate: true })).json()
  const v = await (await desk.post('/api/v1/visits', { patient_id: p.patient_id, chief_complaint: 'Ho nhẹ', vital_signs: { spo2_pct: 88 } })).json()
  await desk.post(`/api/v1/visits/${v.visit_id}/assessment`)
  await desk.patch(`/api/v1/visits/${v.visit_id}/check-in`)
  try {
    await login(page, 'nurse')
    await nav(page, 'Hàng chờ')
    await page.getByRole('button', { name: /^Đã check-in/ }).click()
    const row = page.locator('tr', { hasText: name })
    await row.getByRole('button', { name: 'Đo lại sinh hiệu' }).click()
    const m = page.locator('.modal').first()
    // Chờ cửa sổ nạp xong sinh hiệu đã lưu (88) rồi mới sửa, kẻo bản nạp về ghi đè số vừa gõ.
    await expect(m.locator('#v-spo2_pct')).toHaveValue('88')
    await m.locator('#v-spo2_pct').fill('98')
    await m.getByRole('button', { name: 'Đánh giá lại, cho phép hạ mức' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('thao tác được ghi nhật ký')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Đánh giá lại', exact: true }).click()
    await expect(page.locator('.toast').filter({ hasText: 'Đã đánh giá lại · Thường' })).toBeVisible({ timeout: 10_000 })
    expect((await desk.get(`/api/v1/visits/${v.visit_id}`)).is_red_flag).toBe(false)
  } finally {
    await desk.patch(`/api/v1/visits/${v.visit_id}/cancel`, { reason: 'Dữ liệu kiểm thử tự động' })
    await desk.dispose()
  }
})
