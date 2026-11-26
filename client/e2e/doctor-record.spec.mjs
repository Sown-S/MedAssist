// Bác sĩ sửa thông tin của bệnh nhân đang khám: tình trạng mang thai (ghi theo lượt khám), dị ứng, bệnh nền (hồ sơ)
// và đánh giá lại cho phép hạ mức khi gõ nhầm sinh hiệu.
// Cần server cho bác sĩ sửa is_pregnant của lượt mình (S2) và allergy_notes, medical_history của bệnh nhân mình đang khám (S8).
// Dữ liệu chuẩn bị qua API: bệnh nhân nữ 30 tuổi, lễ tân ghi "không mang thai", bác sĩ nhận khám; xong thì huỷ lượt.
import { test, expect, login, nav, apiAs } from './app.mjs'

test('bác sĩ sửa mang thai, dị ứng, bệnh nền và hạ mức ưu tiên ở màn khám', async ({ page }) => {
  const desk = await apiAs('nurse')
  const doc = await apiAs('physician')
  const name = 'Thử Hồ Sơ ' + String(Date.now()).slice(-5)
  const p = await (await desk.post('/api/v1/patients', { full_name: name, date_of_birth: '1996-05-10', gender: 'Female', confirm_duplicate: true })).json()
  const v = await (await desk.post('/api/v1/visits', { patient_id: p.patient_id, chief_complaint: 'Đau đầu nhẹ', is_pregnant: false })).json()
  await desk.post(`/api/v1/visits/${v.visit_id}/assessment`)
  await desk.patch(`/api/v1/visits/${v.visit_id}/check-in`)
  expect((await doc.patch(`/api/v1/visits/${v.visit_id}/start-exam`)).ok()).toBe(true)
  try {
    await login(page, 'physician')
    await nav(page, 'Khám bệnh & Kê đơn')
    const dismiss = page.locator('.bp-acts').getByRole('button', { name: 'Bỏ qua', exact: true }).first()
    for (let i = 0; i < 5 && (await dismiss.isVisible().catch(() => false)); i++) await dismiss.click()
    await page.locator('.qa-g').first().locator('.qi', { hasText: name }).click()
    const header = page.locator('.ch')
    const reminder = page.locator('.reminder')

    // Mang thai: đầu phiếu và khung nhắc kê đơn đổi ngay, máy chủ đã ghi vào lượt khám.
    await expect(header.getByText('Không mang thai')).toBeVisible()
    await header.getByRole('button', { name: 'Sửa tình trạng mang thai' }).click()
    await header.getByRole('radio', { name: 'Đang mang thai' }).click()
    await header.getByRole('button', { name: 'Lưu', exact: true }).click()
    await expect(page.locator('.toast').filter({ hasText: 'Đã lưu tình trạng mang thai của lượt khám' })).toBeVisible()
    await expect(header.getByText('Đang mang thai')).toBeVisible()
    await expect(reminder.getByText('Đang mang thai')).toBeVisible()
    expect((await doc.get(`/api/v1/visits/${v.visit_id}`)).is_pregnant).toBe(true)

    // Dị ứng, bệnh nền: khung nhắc kê đơn hiện ngay thông tin mới (không phải mở lại bệnh nhân).
    await header.getByRole('button', { name: 'Cập nhật dị ứng / bệnh nền' }).click()
    await header.getByPlaceholder('Penicillin…').fill('Penicillin')
    await header.getByPlaceholder('Tăng huyết áp, đái tháo đường…').fill('Hen phế quản')
    await header.getByRole('button', { name: 'Lưu vào hồ sơ bệnh nhân' }).click()
    await expect(page.locator('.toast').filter({ hasText: 'Đã cập nhật hồ sơ bệnh nhân' })).toBeVisible()
    await expect(reminder.getByText('Penicillin')).toBeVisible()
    await expect(reminder.getByText('Hen phế quản')).toBeVisible()
    expect((await doc.get(`/api/v1/patients/${p.patient_id}`)).allergy_notes).toBe('Penicillin')

    // Gõ nhầm SpO2 88% → Cấp cứu. Sửa lại 98% rồi "Đánh giá lại, cho phép hạ mức": lưu sinh hiệu trước, máy chủ hạ mức.
    await page.getByRole('button', { name: 'Sinh hiệu', exact: true }).click()
    await page.locator('#v-spo2_pct').fill('88')
    await page.getByRole('button', { name: 'Lưu sinh hiệu' }).click()
    await expect(header.locator('h2').getByText('Cấp cứu')).toBeVisible({ timeout: 10_000 })
    await page.locator('#v-spo2_pct').fill('98')
    await header.getByRole('button', { name: 'Đánh giá lại, cho phép hạ mức' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('có thể hạ mức và gỡ cờ đỏ')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Đánh giá lại', exact: true }).click()
    await expect(page.locator('.toast').filter({ hasText: 'Đã đánh giá lại · Thường' })).toBeVisible({ timeout: 10_000 })
    await expect(header.locator('h2').getByText('Cấp cứu')).toHaveCount(0, { timeout: 10_000 })
  } finally {
    await doc.patch(`/api/v1/visits/${v.visit_id}/cancel`, { reason: 'Dữ liệu kiểm thử tự động' })
    await desk.dispose()
    await doc.dispose()
  }
})
