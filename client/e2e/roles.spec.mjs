// Đăng nhập từng vai trò: thấy đúng các mục của vai trò, Quản trị không thấy dữ liệu bệnh nhân.
import { test, expect, login } from './app.mjs'

const NAV = {
  nurse: ['Trang chủ', 'Hàng chờ', 'Bệnh nhân', 'Cấp phát & thu tiền', 'Hóa đơn', 'Đơn thuốc'],
  physician: ['Trang chủ', 'Khám bệnh & Kê đơn', 'Đơn thuốc', 'Tủ thuốc', 'Hồ sơ bệnh nhân', 'Duyệt tri thức'],
  admin: ['Trang chủ', 'Phòng khám', 'Cấu hình AI']
}

for (const [role, items] of Object.entries(NAV)) {
  test(`đăng nhập ${role}: đủ mục trên thanh bên`, async ({ page }) => {
    await login(page, role)
    const side = page.locator('.side')
    for (const t of items) await expect(side.getByText(t, { exact: true }).first()).toBeVisible()
  })
}

test('Quản trị không có mục hồ sơ bệnh nhân', async ({ page }) => {
  await login(page, 'admin')
  await expect(page.locator('.side').getByText('Bệnh nhân', { exact: true })).toHaveCount(0)
  await expect(page.locator('.side').getByText('Hồ sơ bệnh nhân', { exact: true })).toHaveCount(0)
})
