import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { renderPage } from './render.jsx'
import PaymentModal from '../src/renderer/src/components/PaymentModal.jsx'
import { shortageOf } from '../src/renderer/src/api/examApi.js'
import { DESK } from './helpers'
import { installFakeServer, resetCalls, calls, overrideRoute } from './fakeServer'

// Cấp phát & thu tiền ở quầy trên server giả: lượt v-pay có một dòng thuốc chờ cấp và hoá đơn chờ thu (fakeServer.js).
beforeAll(() => installFakeServer())
beforeEach(() => resetCalls())
afterEach(() => cleanup())
afterAll(() => vi.unstubAllGlobals())

const open = async () => {
  renderPage(<PaymentModal open onClose={() => {}} patient={{ id: 'v-pay', name: 'Lê Văn Cường', ticket: 7 }} />, { user: DESK, path: '/reception' })
  await screen.findByText('Paracetamol 500mg', { selector: '.disp-table b' })
}
const sent = (method, path) => calls.filter((c) => c.method === method && c.path === path)

describe('Cấp phát thuốc', () => {
  it('“Đã cấp” gửi Dispensed cho đúng dòng thuốc', async () => {
    await open()
    fireEvent.click(screen.getByText('Dispensed', { selector: 'button, button *' }).closest('button'))
    await waitFor(() => expect(sent('PATCH', '/api/v1/prescription-items/pi1/dispense')).toHaveLength(1))
    expect(sent('PATCH', '/api/v1/prescription-items/pi1/dispense')[0].body).toEqual({ action: 'Dispensed' })
  })

  it('“Bỏ qua” phải ghi lý do (≥ 3 ký tự) rồi mới hoàn kho', async () => {
    await open()
    fireEvent.click(screen.getByText('Skip', { selector: 'button, button *' }).closest('button'))
    const confirm = screen.getByText('Skip & return stock').closest('button')
    fireEvent.change(screen.getByPlaceholderText('Reason (e.g. patient declined, out of stock)'), { target: { value: 'ok' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Reason (e.g. patient declined, out of stock)'), { target: { value: 'Bệnh nhân không lấy' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => expect(sent('PATCH', '/api/v1/prescription-items/pi1/dispense')).toHaveLength(1))
    expect(sent('PATCH', '/api/v1/prescription-items/pi1/dispense')[0].body).toEqual({ action: 'Skipped', skip_reason: 'Bệnh nhân không lấy' })
  })

  it('“Cấp tất cả” gọi dispense-all của lượt', async () => {
    await open()
    fireEvent.click(screen.getByText('Dispense all', { selector: 'button, button *' }).closest('button'))
    await waitFor(() => expect(sent('POST', '/api/v1/visits/v-pay/dispense-all')).toHaveLength(1))
  })
})

describe('Thu tiền', () => {
  it('chọn Chuyển khoản → gửi BankingTransfer', async () => {
    await open()
    fireEvent.click(screen.getByText('Invoice & payment'))
    fireEvent.click(screen.getByText('Bank transfer'))
    fireEvent.click(screen.getByText('Transfer received — collect'))
    await waitFor(() => expect(sent('POST', '/api/v1/visits/v-pay/invoice/pay')).toHaveLength(1))
    expect(sent('POST', '/api/v1/visits/v-pay/invoice/pay')[0].body).toEqual({ payment_method: 'BankingTransfer' })
  })

  it('server từ chối → hiện đúng câu lỗi của server, toast dạng lỗi', async () => {
    const restore = overrideRoute(/^\/api\/v1\/visits\/v-pay\/invoice\/pay$/, () => ({ status: 409, body: { error: { code: 'INVALID_TRANSITION', message: 'Hoá đơn đã được thu' } } }), 'POST')
    try {
      await open()
      fireEvent.click(screen.getByText('Invoice & payment'))
      fireEvent.click(screen.getByText('Collect payment'))
      expect(await screen.findByText('Hoá đơn đã được thu')).toBeTruthy()
      expect(document.querySelector('.toast.error')).toBeTruthy()
    } finally {
      restore()
    }
  })
})

describe('Chốt đơn khi kho thiếu (409 STOCK_SHORTAGE)', () => {
  it('đổi chi tiết lỗi của server thành từng dòng thuốc thiếu, phân biệt hết hàng / sắp hết hạn', () => {
    const lines = [
      { drugId: 'd-amox', name: 'Amoxicilin 500 500 mg' },
      { drugId: 'd-pana', name: 'Panadol 500 mg' }
    ]
    const e = {
      details: [
        { item_id: 'i1', drug_id: 'd-amox', reason: 'OUT_OF_STOCK', needed: 21, available_for_course: 5 },
        { item_id: 'i2', drug_id: 'd-pana', reason: 'EXPIRES_BEFORE_COURSE_END', needed: 10, available_for_course: 0 },
        { item_id: 'i3', drug_id: 'd-gone', reason: 'OUT_OF_STOCK', needed: 3, available_for_course: 0 }
      ]
    }
    expect(shortageOf(e, lines)).toEqual([
      { key: 'i1', name: 'Amoxicilin 500 500 mg', reason: 'out', need: 21, usable: 5 },
      { key: 'i2', name: 'Panadol 500 mg', reason: 'expiring', need: 10, usable: 0 },
      // Thuốc không còn trên phiếu: vẫn liệt kê theo mã để bác sĩ biết.
      { key: 'i3', name: 'd-gone', reason: 'out', need: 3, usable: 0 }
    ])
  })
})
