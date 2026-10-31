import { describe, it, expect, beforeEach } from 'vitest'
import { fresh, admitReady, visitOf, inDays, DOC_A, DOC_B, DESK, ADMIN } from './helpers'

let s
beforeEach(async () => {
  s = await fresh()
})

// Thuốc riêng cho test (không dính dữ liệu mẫu): lots = [[số lô, còn n ngày hạn, số lượng]].
function drug(name, lots, extra = {}) {
  const id = s.inventory.upsertDrug({ name, ingredient: name, atc: '', unit: 'tablet', kind: 'drug', group: 'regular', essential: false, cost: 500, price: 2000, threshold: 0, ...extra }, ADMIN)
  for (const [lot, days, qty] of lots) s.inventory.receiveStock({ drugId: id, lot, expiry: inDays(days), qty, cost: 500 }, ADMIN)
  return id
}
const lotQty = (lot) => s.inventory.getInventory().batches.find((b) => b.lot === lot).qty
const line = (name, qty, days = 5) => ({ name, qty, unit: 'tablet', usage: 'Uống sau ăn', dose: { m: 1, n: 0, a: 1, e: 0, days } })

function examining(index = 0) {
  const v = admitReady(s, index)
  s.queue.takePatient(v.id, DOC_A)
  return v
}
function prescribed(rx, index = 0) {
  const v = examining(index)
  const r = s.queue.finalizeVisit(v.id, { rx, diagnosis: 'J02.9' }, DOC_A)
  if (!r.ok) throw new Error(r.error)
  return { v, inv: r.invoice }
}

describe('Chốt đơn & trừ kho', () => {
  it('thuốc không có trong danh mục → chặn chốt đơn, lượt vẫn Đang khám', () => {
    const v = examining()
    const r = s.queue.finalizeVisit(v.id, { rx: [line('Thuốc lạ XYZ', 10)], diagnosis: 'x' }, DOC_A)
    expect(r).toMatchObject({ ok: false, code: 'UNKNOWN_DRUG' })
    expect(visitOf(s, v.id).status).toBe('Examining')
  })

  it('không đủ tồn → chặn, báo tên thuốc thiếu, không trừ kho', () => {
    drug('Testmycin 250mg', [['T1', 365, 5]])
    const v = examining()
    const r = s.queue.finalizeVisit(v.id, { rx: [line('Testmycin 250mg', 10)], diagnosis: 'x' }, DOC_A)
    expect(r.code).toBe('INSUFFICIENT_STOCK')
    expect(r.short[0]).toMatchObject({ name: 'Testmycin 250mg', need: 10, usable: 5, reason: 'out' })
    expect(lotQty('T1')).toBe(5)
  })

  it('một giao dịch: một dòng thiếu thì các dòng khác cũng không bị trừ', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    drug('Hiếmcin 10mg', [['H1', 365, 1]])
    const v = examining()
    const r = s.queue.finalizeVisit(v.id, { rx: [line('Testmycin 250mg', 10), line('Hiếmcin 10mg', 5)], diagnosis: 'x' }, DOC_A)
    expect(r.ok).toBe(false)
    expect(lotQty('T1')).toBe(100)
  })

  it('xuất lô hết hạn trước (FEFO), ghi lại lô đã trừ cho từng dòng', () => {
    drug('Testmycin 250mg', [['XA', 400, 50], ['GAN', 60, 8]])
    const { v } = prescribed([line('Testmycin 250mg', 10)])
    expect(lotQty('GAN')).toBe(0)
    expect(lotQty('XA')).toBe(48)
    expect(visitOf(s, v.id).rx[0].alloc.map((a) => [a.lot, a.qty])).toEqual([['GAN', 8], ['XA', 2]])
  })

  it('lô sắp hết hạn trước khi uống xong đợt thuốc thì không được cấp', () => {
    drug('Testmycin 250mg', [['SAP', 3, 100]])
    const v = examining()
    const r = s.queue.finalizeVisit(v.id, { rx: [line('Testmycin 250mg', 10, 7)], diagnosis: 'x' }, DOC_A)
    expect(r.short[0].reason).toBe('expiring')
    expect(lotQty('SAP')).toBe(100)
  })

  it('thuốc đã ngừng dùng → chặn với lý do "inactive"', () => {
    const id = drug('Testmycin 250mg', [['T1', 365, 100]])
    s.inventory.setDrugActive(id, false, ADMIN, 'ngừng')
    const v = examining()
    expect(s.queue.finalizeVisit(v.id, { rx: [line('Testmycin 250mg', 10)], diagnosis: 'x' }, DOC_A).short[0].reason).toBe('inactive')
  })

  it('chốt đơn: sang Chờ thanh toán, hoá đơn pending = phí khám + tiền thuốc', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]], { price: 2500 })
    const { v, inv } = prescribed([line('Testmycin 250mg', 10)])
    expect(visitOf(s, v.id)).toMatchObject({ status: 'Prescribed', invoiceId: inv.id, doctorId: DOC_A.id })
    expect(inv).toMatchObject({ status: 'pending', consultation_fee: 80000, drug_fee: 25000, total: 105000 })
    expect(s.queue.payStatusOf(visitOf(s, v.id))).toBe('unpaid')
  })

  it('khám không kê thuốc: hoá đơn chỉ có phí khám', () => {
    const { inv } = prescribed([])
    expect(inv.total).toBe(80000)
    expect(inv.items).toHaveLength(1)
  })

  it('thuốc hướng thần nhà thuốc không bán: bệnh nhân mua ngoài, không tính tiền, không trừ kho', () => {
    const before = s.inventory.getInventory().batches.filter((b) => b.drugId === 'D07').reduce((n, b) => n + b.qty, 0)
    const { v, inv } = prescribed([line('Diazepam 5mg', 4, 2)])
    expect(visitOf(s, v.id).rx[0].dispense_status).toBe('Outside')
    expect(inv.drug_fee).toBe(0)
    expect(s.inventory.getInventory().batches.filter((b) => b.drugId === 'D07').reduce((n, b) => n + b.qty, 0)).toBe(before)
  })
})

describe('Bác sĩ mở lại đơn để sửa', () => {
  it('mở lại: về Đang khám, hoàn kho đúng lô, huỷ hoá đơn pending', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v, inv } = prescribed([line('Testmycin 250mg', 10)])
    expect(s.queue.recallVisit(v.id, DOC_A).ok).toBe(true)
    expect(visitOf(s, v.id)).toMatchObject({ status: 'Examining', invoiceId: null })
    expect(lotQty('T1')).toBe(100)
    expect(s.invoices.invoiceById(inv.id).status).toBe('cancelled')
  })

  it('chỉ bác sĩ kê đơn mới mở lại được', () => {
    const { v } = prescribed([])
    expect(s.queue.recallVisit(v.id, DOC_B).ok).toBe(false)
  })

  it('đã thu tiền thì không mở lại được', () => {
    const { v } = prescribed([])
    s.queue.payVisit(v.id, { method: 'cash' }, DESK)
    expect(s.queue.recallVisit(v.id, DOC_A).ok).toBe(false)
  })

  it('đang có người khác trong phòng thì phải xong người đó trước', () => {
    const { v } = prescribed([], 0)
    examining(1)
    expect(s.queue.recallVisit(v.id, DOC_A).ok).toBe(false)
  })
})

describe('Cấp phát & thu tiền', () => {
  it('bỏ qua một thuốc phải có lý do', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v } = prescribed([line('Testmycin 250mg', 10)])
    expect(s.queue.dispenseItem(v.id, 0, { status: 'Skipped', reason: ' ' }, DESK).ok).toBe(false)
  })

  it('bỏ qua thuốc: hoàn kho, lập lại hoá đơn không còn dòng thuốc đó', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v, inv } = prescribed([line('Testmycin 250mg', 10)])
    s.queue.dispenseItem(v.id, 0, { status: 'Skipped', reason: 'Bệnh nhân còn thuốc ở nhà' }, DESK)
    const x = visitOf(s, v.id)
    expect(lotQty('T1')).toBe(100)
    expect(s.invoices.invoiceById(inv.id).status).toBe('cancelled')
    expect(s.invoices.invoiceById(x.invoiceId)).toMatchObject({ status: 'pending', total: 80000 })
  })

  it('thu tiền trước khi cấp thuốc: đã thu nhưng chưa Hoàn tất cho tới khi cấp xong', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v } = prescribed([line('Testmycin 250mg', 10)])
    expect(s.queue.payVisit(v.id, { method: 'cash' }, DESK).ok).toBe(true)
    expect(visitOf(s, v.id).status).toBe('Prescribed')
    s.queue.dispenseAll(v.id, DESK)
    expect(visitOf(s, v.id).status).toBe('Finished')
  })

  it('cấp xong rồi thu tiền → Hoàn tất; thuốc không bị trừ kho lần hai', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v } = prescribed([line('Testmycin 250mg', 10)])
    s.queue.dispenseAll(v.id, DESK)
    s.queue.payVisit(v.id, { method: 'cash' }, DESK)
    expect(visitOf(s, v.id).status).toBe('Finished')
    expect(lotQty('T1')).toBe(90)
  })

  it('chuyển khoản chờ tiền về → "đang xử lý"; xác nhận tiền về → đã thu', () => {
    const { v, inv } = prescribed([])
    s.queue.payVisit(v.id, { method: 'transfer', ref: 'FT123', waiting: true }, DESK)
    expect(s.queue.payStatusOf(visitOf(s, v.id))).toBe('processing')
    expect(s.queue.confirmVisitPayment(inv.id, 'FT123', DESK).ok).toBe(true)
    expect(s.queue.payStatusOf(visitOf(s, v.id))).toBe('paid')
    expect(visitOf(s, v.id).status).toBe('Finished')
  })

  it('không chọn hình thức thanh toán hợp lệ thì không thu', () => {
    const { v } = prescribed([])
    expect(s.queue.payVisit(v.id, { method: 'card' }, DESK).ok).toBe(false)
  })

  it('đã thu tiền thì không bỏ qua thuốc được nữa', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v } = prescribed([line('Testmycin 250mg', 10)])
    s.queue.payVisit(v.id, { method: 'cash' }, DESK)
    expect(s.queue.dispenseItem(v.id, 0, { status: 'Skipped', reason: 'x' }, DESK).ok).toBe(false)
  })

  it('không thu tiền hai lần', () => {
    const { v } = prescribed([])
    s.queue.payVisit(v.id, { method: 'cash' }, DESK)
    expect(s.queue.payVisit(v.id, { method: 'cash' }, DESK).ok).toBe(false)
  })
})

describe('Huỷ lượt & huỷ hoá đơn', () => {
  it('bệnh nhân bỏ về trước khi trả tiền: phải có lý do, hoàn kho, huỷ hoá đơn', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v, inv } = prescribed([line('Testmycin 250mg', 10)])
    expect(s.queue.cancelPrescribedVisit(v.id, '', DESK).ok).toBe(false)
    expect(s.queue.cancelPrescribedVisit(v.id, 'Bỏ về', DESK).ok).toBe(true)
    expect(visitOf(s, v.id).status).toBe('Cancelled')
    expect(lotQty('T1')).toBe(100)
    expect(s.invoices.invoiceById(inv.id).status).toBe('cancelled')
  })

  it('đã cấp thuốc thì không huỷ lượt kiểu "bỏ về" được', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v } = prescribed([line('Testmycin 250mg', 10)])
    s.queue.dispenseItem(v.id, 0, { status: 'Dispensed' }, DESK)
    expect(s.queue.cancelPrescribedVisit(v.id, 'Bỏ về', DESK).ok).toBe(false)
  })

  it('lễ tân huỷ hoá đơn ĐÃ THU phải có Quản trị viên xác nhận', () => {
    const { v, inv } = prescribed([])
    s.queue.payVisit(v.id, { method: 'cash' }, DESK)
    expect(s.queue.voidInvoice(inv.id, 'Thu nhầm', DESK).ok).toBe(false)
    expect(s.queue.voidInvoice(inv.id, 'Thu nhầm', DESK, { approvedBy: ADMIN.name }).ok).toBe(true)
    const x = visitOf(s, v.id)
    expect(x.status).toBe('Prescribed')
    expect(s.invoices.invoiceById(x.invoiceId).status).toBe('pending')
  })

  it('huỷ hoá đơn có trả lại thuốc: nhập lại kho, dòng thuốc thành "bỏ qua"', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v, inv } = prescribed([line('Testmycin 250mg', 10)])
    s.queue.dispenseAll(v.id, DESK)
    s.queue.payVisit(v.id, { method: 'cash' }, DESK)
    s.queue.voidInvoice(inv.id, 'Trả thuốc', ADMIN, { restock: true })
    expect(lotQty('T1')).toBe(100)
    expect(visitOf(s, v.id).rx[0].dispense_status).toBe('Skipped')
    expect(s.invoices.invoiceById(visitOf(s, v.id).invoiceId).drug_fee).toBe(0)
  })

  it('huỷ hoá đơn phải có lý do', () => {
    const { inv } = prescribed([])
    expect(s.invoices.cancelInvoice(inv.id, '  ', ADMIN).ok).toBe(false)
  })
})

describe('Dòng dịch vụ & tổng tiền', () => {
  it('thêm dịch vụ cận lâm sàng: tổng tiền tính lại, giữ dòng thuốc', () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v } = prescribed([line('Testmycin 250mg', 10)])
    const r = s.queue.setServiceLines(v.id, [{ item_type: 'Consultation', name: 'Phí khám', amount: 80000 }, { item_type: 'Paraclinical', name: 'Siêu âm', amount: 150000 }], DESK)
    expect(r.ok).toBe(true)
    const inv = s.invoices.invoiceById(visitOf(s, v.id).invoiceId)
    expect(inv).toMatchObject({ paraclinical_fee: 150000, drug_fee: 20000, total: 250000 })
  })

  it('dòng dịch vụ sai loại / thiếu tên / tiền âm bị từ chối', () => {
    const { v } = prescribed([])
    expect(s.queue.setServiceLines(v.id, [{ item_type: 'Drug', name: 'x', amount: 1 }], DESK).ok).toBe(false)
    expect(s.queue.setServiceLines(v.id, [{ item_type: 'Paraclinical', name: ' ', amount: 1 }], DESK).ok).toBe(false)
    expect(s.queue.setServiceLines(v.id, [{ item_type: 'Paraclinical', name: 'x', amount: -5 }], DESK).ok).toBe(false)
  })

  it('đã thu tiền thì không sửa dòng dịch vụ', () => {
    const { v } = prescribed([])
    s.queue.payVisit(v.id, { method: 'cash' }, DESK)
    expect(s.queue.setServiceLines(v.id, [], DESK).ok).toBe(false)
  })

  it('tổng phụ theo loại cộng đúng', () => {
    expect(
      s.invoices.subtotals([
        { item_type: 'Consultation', amount: 80000 },
        { item_type: 'Paraclinical', amount: 50000 },
        { item_type: 'Drug', amount: 12000 },
        { name: 'Consultation fee', amount: 1000 }
      ])
    ).toEqual({ consultation_fee: 81000, paraclinical_fee: 50000, drug_fee: 12000, total: 143000 })
  })

  it('số tiền hiển thị ở quầy = tổng hoá đơn đang có', async () => {
    drug('Testmycin 250mg', [['T1', 365, 100]])
    const { v, inv } = prescribed([line('Testmycin 250mg', 10)])
    const { estimateTotal } = await import('../src/renderer/src/api/billing.js')
    expect(estimateTotal(visitOf(s, v.id))).toBe(inv.total)
  })

  it('số hoá đơn không trùng nhau', () => {
    const a = prescribed([], 0).inv
    const b = prescribed([], 1).inv
    expect(a.id).not.toBe(b.id)
    expect(a.id).toMatch(/^HD-\d{6}-\d{4}$/)
  })
})
