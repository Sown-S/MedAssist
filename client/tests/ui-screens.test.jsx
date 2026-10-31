import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { renderPage } from './render.jsx'
import Reception from '../src/renderer/src/pages/Reception.jsx'
import Doctor from '../src/renderer/src/pages/Doctor.jsx'
import Admin from '../src/renderer/src/pages/Admin.jsx'
import * as queue from '../src/renderer/src/api/queueStore.js'
import { getPatients } from '../src/renderer/src/api/patientStore.js'
import { DOC_A, DOC_B, DESK, ADMIN, tick } from './helpers'
import { printReceipt } from '../src/renderer/src/components/queuePrint.js'

// jsdom không có khung in → thay printReceipt bằng hàm giả để kiểm tra được gọi.
vi.mock('../src/renderer/src/components/queuePrint.js', async (orig) => ({ ...(await orig()), printReceipt: vi.fn() }))

// Test giao diện (bản demo): mọi màn chính của 3 vai trò dựng được mà không rơi vào lưới bắt lỗi, và vài luồng chính
// bấm được. Lưới an toàn khi chia nhỏ các file lớn.
const FAIL = 'Something went wrong on this screen'

afterEach(() => cleanup())

async function rendered() {
  await waitFor(() => expect(document.body.textContent.trim()).not.toBe(''))
  expect(screen.queryByText(FAIL)).toBeNull()
}

// tiếp đón → check-in → `doctor` nhận khám (mỗi bác sĩ một người trong phòng)
function examining(index, doctor = DOC_A) {
  tick()
  const r = queue.createVisit(getPatients()[index], { reason: 'Ho, sốt', priority: false }, DESK)
  if (!r.ok) throw new Error(r.error)
  queue.checkInVisit(r.visit.id, DESK)
  const t = queue.takePatient(r.visit.id, doctor)
  if (!t.ok) throw new Error(t.error)
  return r.visit
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
    const items = ['Patient records', 'Payment invoices', 'AI configuration', 'Rooms', 'Stock & expiry', 'Catalog management', 'Activity history', 'Staff accounts', 'Settings', 'Roadmap', 'Home']
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
  it('bác sĩ mở phiếu khám của bệnh nhân đang trong phòng', async () => {
    const v = examining(0)
    renderPage(<Doctor />, { user: DOC_A, path: `/doctor?view=consult&visit=${v.id}` })
    await rendered()
    expect((await screen.findAllByText(v.name)).length).toBeGreaterThan(0)
  })

  it('lễ tân thu tiền lượt đã kết thúc khám (không kê thuốc)', async () => {
    const v = examining(1, DOC_B)
    const f = queue.finalizeVisit(v.id, { rx: [], diagnosis: 'J02.9' }, DOC_B)
    expect(f.ok).toBe(true)
    renderPage(<Reception />, { user: DESK, path: '/reception?view=home' })
    await rendered()
    // Trang chủ Lễ tân: dòng của bệnh nhân → “Dispense & collect” → tab hoá đơn → thu tiền.
    const row = (await screen.findAllByText(v.name)).map((el) => el.closest('.pay-row')).find(Boolean)
    fireEvent.click(within(row).getByText('Dispense & collect'))
    fireEvent.click(await screen.findByText('Invoice & payment'))
    fireEvent.click(await screen.findByText('Collect payment'))
    await waitFor(() => expect(queue.getQueue().visits.find((x) => x.id === v.id).status).toBe(queue.ST.FINISHED))
    await waitFor(() => expect(printReceipt).toHaveBeenCalledWith(expect.objectContaining({ name: v.name })))
  })
})
