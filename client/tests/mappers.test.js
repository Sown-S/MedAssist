import { describe, it, expect } from 'vitest'
import { isoDob, dmyDob, maskDob, toPatient, chiefComplaintOf } from '../src/renderer/src/api/clinicApi.js'
import { fromAwaiting, receiptOf, toServerMethod, fromServerMethod } from '../src/renderer/src/api/billingApi.js'
import { toLabOrder } from '../src/renderer/src/api/serviceStore.js'

// Các hàm đổi dữ liệu server (snake_case, ISO, số dạng chuỗi) sang hình dạng màn hình đang dùng.
// Sai một tên trường ở đây là cả màn hiện trống / sai mà không báo lỗi — nên khoá lại bằng test.

describe('Ngày sinh dd/mm/yyyy ↔ ISO', () => {
  it('đổi hai chiều, thêm số 0 còn thiếu', () => {
    expect(isoDob('5/3/2019')).toBe('2019-03-05')
    expect(dmyDob('2019-03-05')).toBe('05/03/2019')
    expect(dmyDob('2019-03-05T00:00:00Z')).toBe('05/03/2019')
  })
  it('dữ liệu không đúng dạng → null / chuỗi rỗng, không ném lỗi', () => {
    expect(isoDob('2019-03-05')).toBeNull()
    expect(isoDob(undefined)).toBeNull()
    expect(dmyDob(null)).toBe('')
  })
  it('ô nhập tự chèn dấu "/" khi gõ số liền nhau', () => {
    expect(maskDob('05032019')).toBe('05/03/2019')
    expect(maskDob('0503')).toBe('05/03')
    expect(maskDob('05a03-2019999')).toBe('05/03/2019')
  })
})

describe('Hồ sơ bệnh nhân từ server (toPatient)', () => {
  const server = {
    patient_id: 'p-1',
    patient_code: 'BN-3F2A9C1B',
    full_name: 'Nguyễn Văn A',
    date_of_birth: '2019-03-05',
    gender: 'Male',
    phone: null,
    id_number: null,
    allergy_notes: 'Penicillin',
    medical_history: { chronic_conditions: ['Hen phế quản'], notes: 'Hay viêm họng', is_pregnant: false }
  }
  it('đổi tên trường và định dạng ngày', () => {
    expect(toPatient(server)).toMatchObject({ id: 'p-1', code: 'BN-3F2A9C1B', name: 'Nguyễn Văn A', dob: '05/03/2019', phone: '', idNumber: '', allergies: 'Penicillin' })
  })
  it('bệnh nền = danh sách bệnh mạn + ghi chú; giữ nguyên medical_history để PATCH không mất dữ liệu', () => {
    const p = toPatient(server)
    expect(p.history).toBe('Hen phế quản, Hay viêm họng')
    expect(p.medicalHistory).toBe(server.medical_history)
  })
  it('mang thai: true → "yes", false → "no", chưa hỏi → ""', () => {
    expect(toPatient(server).pregnancy).toBe('no')
    expect(toPatient({ ...server, medical_history: { is_pregnant: true } }).pregnancy).toBe('yes')
    expect(toPatient({ ...server, medical_history: null }).pregnancy).toBe('')
  })
})

describe('Lý do khám (chief_complaint)', () => {
  it('lấy câu đầu của lời kể', () => {
    expect(chiefComplaintOf('Sốt cao 2 ngày. Ho có đờm')).toBe('Sốt cao 2 ngày')
    expect(chiefComplaintOf('Đau bụng\nnôn 3 lần')).toBe('Đau bụng')
  })
  it('lời kể trống → "Khám bệnh"; quá dài → cắt ở 2000 ký tự', () => {
    expect(chiefComplaintOf('  ')).toBe('Khám bệnh')
    expect(chiefComplaintOf('a'.repeat(2500))).toHaveLength(2000)
  })
})

describe('Thu tiền (billingApi)', () => {
  it('hình thức thanh toán đổi hai chiều', () => {
    expect(toServerMethod('transfer')).toBe('BankingTransfer')
    expect(toServerMethod('cash')).toBe('Cash')
    expect(fromServerMethod('BankingTransfer')).toBe('transfer')
    expect(fromServerMethod('Cash')).toBe('cash')
  })
  it('dòng chờ thu tiền: số tiền dạng chuỗi → số, thiếu thì 0', () => {
    const a = { visit_id: 'v1', queue_number: 7, patient_name: 'B', invoice_code: 'HD-1', payment_status: 'Pending', has_prescription: true, total_amount: '125000.00', pending_items: 2 }
    expect(fromAwaiting(a)).toEqual({ id: 'v1', ticket: 7, name: 'B', doctor: '', invoiceCode: 'HD-1', payStatus: 'Pending', hasRx: true, total: 125000, pending: 2 })
    expect(fromAwaiting({ ...a, total_amount: null }).total).toBe(0)
  })
  it('biên lai: tổng và từng dòng là số', () => {
    const inv = {
      invoice_code: 'HD-1',
      payment_method: 'BankingTransfer',
      created_at: '2026-11-01T08:00:00+07:00',
      paid_at: '2026-11-01T08:05:00+07:00',
      total_amount: '180000.00',
      items: [{ item_name: 'Khám bệnh', quantity: 1, subtotal: '80000.00' }, { item_name: 'Paracetamol 500mg', quantity: 10, subtotal: '100000.00' }]
    }
    const r = receiptOf(inv, { name: 'B', ticket: 7, byName: 'Lễ tân' })
    expect(r).toMatchObject({ id: 'HD-1', method: 'transfer', total: 180000 })
    expect(r.items).toEqual([
      { name: 'Khám bệnh', qty: 1, amount: 80000 },
      { name: 'Paracetamol 500mg', qty: 10, amount: 100000 }
    ])
  })
})

describe('Phiếu chỉ định từ server (toLabOrder)', () => {
  const order = {
    order_id: 'o1',
    ordered_at: '2026-11-01T08:00:00+07:00',
    ordered_by_name: 'BS A',
    package_name: 'Gói khám tổng quát',
    items: [
      { item_id: 'i1', item_name: 'Khám bệnh', group_key: 'consult', in_package: true, status: 'Ordered' },
      { item_id: 'i2', item_name: 'Công thức máu', group_key: 'blood', in_package: true, status: 'Ordered', ref_low: 4, ref_high: 10, unit: 'G/L' },
      { item_id: 'i3', item_name: 'CRP', group_key: 'blood', in_package: false, status: 'Cancelled', ref_text: '< 5 mg/L' }
    ]
  }
  it('bỏ dịch vụ khám trong gói (group_key "consult") khỏi danh sách xét nghiệm', () => {
    expect(toLabOrder(order).tests.map((x) => x.name)).toEqual(['Công thức máu', 'CRP'])
  })
  it('mã dòng = item_id (khoá kết quả "<order>:<item>"), dòng huỷ có cờ cancelled', () => {
    const [cbc, crp] = toLabOrder(order).tests
    expect(cbc).toMatchObject({ code: 'i2', itemId: 'i2', inPackage: true, cancelled: false })
    expect(crp.cancelled).toBe(true)
  })
  it('khoảng tham chiếu: ghi chú của danh mục, không có thì "thấp–cao đơn vị"', () => {
    const [cbc, crp] = toLabOrder(order).tests
    expect(cbc.ref).toBe('4–10 G/L')
    expect(crp.ref).toBe('< 5 mg/L')
  })
})
