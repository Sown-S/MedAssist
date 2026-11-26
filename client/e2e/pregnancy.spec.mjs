// Bác sĩ sửa tình trạng mang thai của lượt đang khám (mang thai ghi theo lượt; cần server cho bác sĩ sửa is_pregnant).
// Dữ liệu chuẩn bị qua API: bệnh nhân nữ 30 tuổi, lễ tân ghi "không mang thai", bác sĩ nhận khám.
import { test, expect, login, nav, apiAs } from './app.mjs'

test('bác sĩ sửa tình trạng mang thai ở màn khám', async ({ page }) => {
  const desk = await apiAs('nurse')
  const doc = await apiAs('physician')
  const name = 'Thử Mang Thai ' + String(Date.now()).slice(-5)
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
    await expect(header.getByText('Không mang thai')).toBeVisible()
    await header.getByRole('button', { name: 'Sửa tình trạng mang thai' }).click()
    await header.getByRole('radio', { name: 'Đang mang thai' }).click()
    await header.getByRole('button', { name: 'Lưu', exact: true }).click()
    await expect(page.locator('.toast').filter({ hasText: 'Đã lưu tình trạng mang thai của lượt khám' })).toBeVisible()
    // Đầu phiếu và khung nhắc kê đơn đổi ngay, máy chủ đã ghi vào lượt khám.
    await expect(header.getByText('Đang mang thai')).toBeVisible()
    await expect(page.locator('.reminder').getByText('Đang mang thai')).toBeVisible()
    expect((await doc.get(`/api/v1/visits/${v.visit_id}`)).is_pregnant).toBe(true)
  } finally {
    await doc.patch(`/api/v1/visits/${v.visit_id}/cancel`, { reason: 'Dữ liệu kiểm thử tự động' })
    await desk.dispose()
    await doc.dispose()
  }
})
