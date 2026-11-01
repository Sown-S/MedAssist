import { describe, it, expect } from 'vitest'
import { toDrug, findServerDrug } from '../src/renderer/src/api/serverDrugs.js'
import { drugForTemplate, RX } from '../src/renderer/src/pages/doctor/consult/rxDraft.js'

// Danh mục như server: tên hiển thị ghép từ tên thương mại + hàm lượng, khác hẳn tên hoạt chất.
const raw = (id, generic, trade, strength, form) => ({ drug_id: id, generic_name: generic, trade_name: trade, strength, dosage_form: form, unit: 'viên', sale_price: '1000', is_active: true })
const stock = (usable) => ({ usable_quantity: usable, near_expiry_quantity: 0, expired_quantity: 0 })
const drugs = [
  toDrug(raw('pana', 'Paracetamol', 'Panadol', '500 mg', 'viên nén'), stock(0)),
  toDrug(raw('effer', 'Paracetamol', 'Efferalgan 500', '500 mg', 'viên sủi'), stock(50)),
  toDrug(raw('goi', 'Paracetamol', 'Paracetamol 500 mg', '500 mg', 'bột pha dung dịch'), stock(50)),
  toDrug(raw('amox', 'Amoxicilin', 'Amoxicilin 500', '500 mg', 'viên nang'), stock(20))
]

describe('Đơn mẫu tra theo hoạt chất + hàm lượng', () => {
  it('ưu tiên đúng dạng bào chế, kể cả khi thuốc đó đang hết tồn', () => {
    expect(drugForTemplate({ generic: 'Paracetamol', strength: '500 mg', form: 'viên nén' }, drugs).id).toBe('pana')
  })

  it('không phân biệt hoa thường / khoảng trắng; không có thuốc khớp → null', () => {
    expect(drugForTemplate({ generic: 'amoxicilin', strength: '500mg', form: 'viên nang' }, drugs).id).toBe('amox')
    expect(drugForTemplate({ generic: 'Metformin', strength: '500 mg', form: 'viên' }, drugs)).toBeNull()
  })

  it('mọi dòng đơn mẫu đều khai hoạt chất, hàm lượng và số lượng', () => {
    for (const line of Object.values(RX).flat()) expect(line).toMatchObject({ generic: expect.any(String), strength: expect.any(String), qty: expect.any(Number) })
  })
})

describe('Tìm thuốc theo nhãn của lịch sử khám / hoá đơn', () => {
  it('"<hoạt chất> <hàm lượng> (<tên thương mại>)" → đúng thuốc', () => {
    expect(findServerDrug('Paracetamol 500 mg (Panadol)', drugs).id).toBe('pana')
    expect(findServerDrug('Amoxicilin 500 mg (Amoxicilin 500)', drugs).id).toBe('amox')
  })

  it('tên hiển thị của danh mục vẫn tìm được', () => {
    expect(findServerDrug('Panadol 500 mg', drugs).id).toBe('pana')
  })
})
