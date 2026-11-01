import { describe, it, expect, afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { renderPage } from './render.jsx'
import Reception from '../src/renderer/src/pages/Reception.jsx'
import Doctor from '../src/renderer/src/pages/Doctor.jsx'
import Admin from '../src/renderer/src/pages/Admin.jsx'
import { syncQueue } from '../src/renderer/src/api/queueStore.js'
import { DOC_A, DOC_B, DESK, ADMIN } from './helpers'
import { installFakeServer, resetCalls, calls } from './fakeServer'

// Test giao diện trên server giả (fakeServer.js): mọi màn chính của 3 vai trò dựng được mà không rơi vào lưới bắt lỗi,
// và vài thao tác chính gọi đúng API. Lưới an toàn khi sửa / chia nhỏ các file lớn.
const FAIL = 'Something went wrong on this screen'

// Giữ fetch giả suốt cả file: bộ đếm giờ còn sót của test trước (polling hàng đợi, /health) không được gọi ra mạng thật
// — nếu máy đang bật server, nó trả 401 và làm phiên của test sau bị đăng xuất.
beforeAll(() => installFakeServer())
beforeEach(() => resetCalls())
afterEach(() => cleanup())
afterAll(() => vi.unstubAllGlobals())

// Chờ trang dựng xong; bỏ qua ô thông báo (luôn có sẵn dấu ✓) để không coi là đã dựng khi chưa đăng nhập xong.
const pageText = () => [...document.body.querySelectorAll('body > div > :not(.toast)')].map((el) => el.textContent).join('').trim()
async function rendered() {
  await waitFor(() => expect(pageText()).not.toBe(''))
  expect(screen.queryByText(FAIL)).toBeNull()
}

describe('Các màn chính dựng được', () => {
  it.each(['home', 'queue', 'invoices', 'prescriptions'])('Lễ tân › %s', async (view) => {
    renderPage(<Reception />, { user: DESK, path: '/reception?view=' + view })
    await rendered()
  })

  it.each(['home', 'consult', 'prescriptions', 'drugs', 'patients'])('Bác sĩ › %s', async (view) => {
    renderPage(<Doctor />, { user: DOC_A, path: '/doctor?view=' + view })
    await rendered()
  })

  it('Quản trị › mọi mục trên menu trái', async () => {
    renderPage(<Admin onNavigate={() => {}} />, { user: ADMIN, path: '/admin' })
    await rendered()
    const items = ['AI configuration', 'Rooms', 'Stock & expiry', 'Catalog management', 'Activity history', 'Staff accounts', 'Settings', 'Roadmap', 'Home']
    for (const label of items) {
      fireEvent.click(screen.getByText(label, { selector: '.side-item .lb, .side-subitem' }))
      await rendered()
    }
  })

  // Mỗi tab là một file riêng — bấm qua hết để chắc tab nào cũng dựng được.
  it.each([
    ['Settings', ['Printing & numbering', 'Security', 'Backup & retention', 'Connection & AI', 'This computer', 'Operations', 'Clinic']],
    ['Stock & expiry', ['Stock movements', 'Controlled drugs ledger', 'Stock by batch']]
  ])('Quản trị › %s › từng tab', async (page, tabs) => {
    renderPage(<Admin onNavigate={() => {}} />, { user: ADMIN, path: '/admin' })
    await rendered()
    fireEvent.click(screen.getByText(page, { selector: '.side-item .lb' }))
    await rendered()
    for (const tab of tabs) {
      fireEvent.click(screen.getByText(tab, { selector: 'button, button *' }))
      await rendered()
    }
  })
})

describe('Luồng chính trên giao diện', () => {
  it('bác sĩ mở phiếu khám của bệnh nhân đang trong phòng (tải chi tiết lượt từ server)', async () => {
    await syncQueue()
    renderPage(<Doctor />, { user: DOC_A, path: '/doctor?view=consult&visit=v-exam' })
    await rendered()
    expect((await screen.findAllByText('Nguyễn Văn An')).length).toBeGreaterThan(0)
    await waitFor(() => expect(calls.some((c) => c.path === '/api/v1/visits/v-exam')).toBe(true))
  })

  it('bác sĩ thu hồi đơn còn chờ thanh toán của mình → POST …/prescription/reopen', async () => {
    renderPage(<Doctor />, { user: DOC_B, path: '/doctor?view=prescriptions' })
    await rendered()
    fireEvent.click(await screen.findByText('Lê Văn Cường'))
    fireEvent.click(await screen.findByText('Recall to edit (not yet paid)'))
    fireEvent.click(await screen.findByText('Recall', { selector: 'button, button *' }))
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'POST', path: '/api/v1/visits/v-paid-wait/prescription/reopen' })))
  })

  it('lễ tân check-in bệnh nhân đang chờ → PATCH /visits/{id}/check-in', async () => {
    await syncQueue()
    renderPage(<Reception />, { user: DESK, path: '/reception?view=queue' })
    await rendered()
    fireEvent.click(await screen.findByText('Trần Thị Bình'))
    fireEvent.click(await screen.findByText('Mark present — check in'))
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'PATCH', path: '/api/v1/visits/v-wait/check-in' })))
  })
})
