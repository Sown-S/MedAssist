import { describe, it, expect, beforeEach } from 'vitest'
import { fresh, inDays, ADMIN } from './helpers'

let s
let safety
let checks
beforeEach(async () => {
  s = await fresh()
  safety = await import('../src/renderer/src/api/rxSafety.js')
  checks = await import('../src/renderer/src/api/rxChecks.js')
})

const drugs = () => s.inventory.getInventory().drugs
const rx = (name, dose, qty = 10, id = 1) => ({ id, name, qty, dose })
const kinds = (out) => out.map((x) => [x.kind, x.level])

describe('Quy tắc kê đơn theo quy định', () => {
  it('phân loại thuốc kiểm soát: Tramadol = gây nghiện (N), Diazepam = hướng thần (H)', () => {
    const find = (n) => s.inventory.findDrugByName(n)
    expect(safety.controlledKind(find('Tramadol 50mg'))).toBe('N')
    expect(safety.controlledKind(find('Diazepam 5mg'))).toBe('H')
    expect(safety.controlledKind(find('Paracetamol 500mg'))).toBeNull()
  })

  it('thuốc gây nghiện không ghi liều theo ngày / số ngày → chặn', () => {
    const out = safety.checkRxSafety([rx('Tramadol 50mg', { m: 1, days: '' })], [], drugs())
    expect(kinds(out)).toContainEqual(['controlled_dose', 'block'])
  })

  it('thuốc gây nghiện quá 7 ngày → chặn; 7 ngày thì được', () => {
    expect(kinds(safety.checkRxSafety([rx('Tramadol 50mg', { m: 1, a: 1, days: 8 })], [], drugs()))).toContainEqual(['controlled_days', 'block'])
    expect(safety.checkRxSafety([rx('Tramadol 50mg', { m: 1, a: 1, days: 7 })], [], drugs())).toEqual([])
  })

  it('thuốc thường quá 30 ngày → chặn', () => {
    expect(kinds(safety.checkRxSafety([rx('Metformin 500mg', { m: 1, a: 1, days: 31 })], [], drugs()))).toContainEqual(['general_days', 'block'])
  })

  it('kháng sinh quá 14 ngày → chỉ nhắc (không chặn)', () => {
    expect(kinds(safety.checkRxSafety([rx('Amoxicillin 500mg', { m: 1, a: 1, days: 15 })], [], drugs()))).toEqual([['antibiotic_days', 'warning']])
  })

  it('liều/ngày vượt tối đa người lớn → mức nặng (phải ghi lý do)', () => {
    // Paracetamol 500mg × 3 viên × 3 lần = 4500 mg > 4000 mg
    const out = safety.checkRxSafety([rx('Paracetamol 500mg', { m: 3, n: 3, a: 3, days: 3 })], [], drugs(), Date.now(), { age: 40 })
    expect(out[0]).toMatchObject({ kind: 'dose_day', level: 'severe', daily: 4500, limit: 4000 })
  })

  it('trẻ em: giới hạn liều theo cân nặng (mg/kg/ngày)', () => {
    // Trẻ 15 kg: Paracetamol tối đa 60 mg/kg/ngày = 900 mg; kê 500 mg × 2 = 1000 mg
    const out = safety.checkRxSafety([rx('Paracetamol 500mg', { m: 1, a: 1, days: 3 })], [], drugs(), Date.now(), { age: 4, weight: '15' })
    expect(out[0]).toMatchObject({ kind: 'dose_kg', limit: 900 })
  })

  it('trùng thuốc với đơn cũ chưa uống hết → nhắc, đơn đã hết hạn thì thôi', () => {
    const now = Date.now()
    const recent = { id: 'p1', rxAt: new Date(now - 2 * 86400000).toISOString(), rx: [rx('Omeprazol 20mg', { m: 1, days: 14 })], doctor: 'BS X' }
    const old = { id: 'p2', rxAt: new Date(now - 30 * 86400000).toISOString(), rx: [rx('Omeprazol 20mg', { m: 1, days: 14 })] }
    expect(kinds(safety.checkRxSafety([rx('Omeprazol 20mg', { m: 1, days: 7 })], [recent], drugs(), now))).toEqual([['duplicate', 'warning']])
    expect(safety.checkRxSafety([rx('Omeprazol 20mg', { m: 1, days: 7 })], [old], drugs(), now)).toEqual([])
  })

  it('số ngày dùng tính từ số lượng khi không ghi số ngày', () => {
    expect(safety.daysOf({ qty: 20, dose: { m: 1, a: 1 } })).toBe(10)
    expect(safety.daysOf({ qty: 5, dose: {} })).toBeNull()
  })
})

describe('Kiểm tra dị ứng & tương tác thuốc', () => {
  it('dị ứng ghi trong hồ sơ trùng thuốc kê → chống chỉ định', () => {
    const out = checks.checkRx([{ name: 'Amoxicillin 500mg' }], { age: 30, allergies: 'Amoxicillin', history: '' })
    expect(out[0]).toMatchObject({ level: 'contraindicated', type: 'allergy' })
  })

  it('dị ứng Penicillin + kê Amoxicillin → chống chỉ định (dị ứng chéo)', () => {
    const out = checks.checkRx([{ name: 'Amoxicillin 500mg' }], { age: 30, allergies: 'Penicillin', history: '' })
    expect(out.some((x) => x.level === 'contraindicated' && x.type === 'allergy')).toBe(true)
  })

  it('NSAID cho người suy thận (ghi tiếng Việt không dấu / có dấu) → chống chỉ định', () => {
    const out = checks.checkRx([{ name: 'Ibuprofen 400mg' }], { age: 60, allergies: '', history: 'Suy thận mạn' })
    expect(out.some((x) => x.type === 'condition' && x.level === 'contraindicated')).toBe(true)
  })

  it('Amoxicillin + Cefuroxim cùng đơn → nhắc trùng nhóm', () => {
    const out = checks.checkRx([{ name: 'Amoxicillin 500mg' }, { name: 'Cefuroxim 500mg' }], { age: 30, allergies: '', history: '' })
    expect(out.some((x) => x.type === 'class')).toBe(true)
  })

  it('kết quả xếp mức nặng nhất lên đầu, không lặp cảnh báo', () => {
    const out = checks.checkRx([{ name: 'Amoxicillin 500mg' }, { name: 'Cefuroxim 500mg' }], { age: 30, allergies: 'Penicillin', history: '' })
    expect(out[0].level).toBe('contraindicated')
    expect(new Set(out.map((x) => x.key)).size).toBe(out.length)
  })

  it('đơn bình thường không có cảnh báo; Paracetamol chỉ có dòng nhắc liều tối đa', () => {
    const adult = { age: 30, allergies: '', history: '' }
    expect(checks.checkRx([{ name: 'Loratadin 10mg' }], adult)).toEqual([])
    expect(kinds(checks.checkRx([{ name: 'Paracetamol 500mg' }], adult).map((x) => ({ kind: x.type, level: x.level })))).toEqual([['dose', 'warning']])
  })
})

describe('Kho thuốc', () => {
  it('tìm thuốc theo tên không phân biệt hoa thường / khoảng trắng', () => {
    expect(s.inventory.findDrugByName('  paracetamol   500MG ').id).toBe('D01')
    expect(s.inventory.findDrugByName('Không có thuốc này')).toBeUndefined()
  })

  it('hạn ghi MM/YYYY = ngày cuối tháng (kể cả tháng 2 năm nhuận)', () => {
    expect(s.inventory.endOfMonth(2, 2028)).toBe('2028-02-29')
    expect(s.inventory.endOfMonth(2, 2027)).toBe('2027-02-28')
    expect(s.inventory.endOfMonth(12, 2027)).toBe('2027-12-31')
  })

  it('tồn dùng được không tính lô đã hết hạn; báo hết hàng / sắp hết hạn / đã hết hạn', () => {
    const id = s.inventory.upsertDrug({ name: 'Khotest 1mg', unit: 'tablet', kind: 'drug', group: 'regular', price: 1, threshold: 50, cost: 1 }, ADMIN)
    s.inventory.receiveStock({ drugId: id, lot: 'HH', expiry: inDays(-5), qty: 30, cost: 1 }, ADMIN)
    s.inventory.receiveStock({ drugId: id, lot: 'GAN', expiry: inDays(20), qty: 10, cost: 1 }, ADMIN)
    const st = s.inventory.stockOf(s.inventory.getInventory().drugs.find((d) => d.id === id))
    expect(st).toMatchObject({ usable: 10, expired: 30, nearQty: 10 })
    expect(st.statuses).toEqual(['low', 'near', 'expired'])
  })

  it('nhập lô: thẻ kho ghi phiếu nhập và tồn cuối đúng', () => {
    const id = s.inventory.upsertDrug({ name: 'Khotest 1mg', unit: 'tablet', kind: 'drug', group: 'regular', price: 1, threshold: 0, cost: 1 }, ADMIN)
    s.inventory.receiveStock({ drugId: id, lot: 'A', expiry: inDays(300), qty: 40, cost: 1 }, ADMIN)
    s.inventory.receiveStock({ drugId: id, lot: 'B', expiry: inDays(300), qty: 60, cost: 1 }, ADMIN)
    const moves = s.inventory.getInventory().moves.filter((m) => m.drugId === id)
    expect(moves.map((m) => m.type)).toEqual(['in', 'in'])
    expect(moves[0].balance).toBe(100)
  })

  it('hoàn kho cộng lại đúng lô đã trừ', () => {
    const id = s.inventory.upsertDrug({ name: 'Khotest 1mg', unit: 'tablet', kind: 'drug', group: 'regular', price: 1, threshold: 0, cost: 1 }, ADMIN)
    s.inventory.receiveStock({ drugId: id, lot: 'A', expiry: inDays(300), qty: 40, cost: 1 }, ADMIN)
    const r = s.inventory.deductForCourse([{ key: 0, drugId: id, qty: 15, days: 5 }], 'RX-TEST', ADMIN)
    expect(s.inventory.getInventory().batches.find((b) => b.lot === 'A').qty).toBe(25)
    s.inventory.restoreAllocations([r.alloc[0]], 'RX-TEST', ADMIN)
    expect(s.inventory.getInventory().batches.find((b) => b.lot === 'A').qty).toBe(40)
  })

  it('thuốc kê đơn bắt buộc: kháng sinh J01 và thuốc kiểm soát; vật tư thì không', () => {
    const find = (n) => s.inventory.findDrugByName(n)
    expect(s.inventory.isRxOnly(find('Amoxicillin 500mg'))).toBe(true)
    expect(s.inventory.isRxOnly(find('Diazepam 5mg'))).toBe(true)
    expect(s.inventory.isRxOnly(find('Paracetamol 500mg'))).toBe(false)
    expect(s.inventory.isRxOnly(find('Sterile gauze 10×10cm'))).toBe(false)
  })
})
