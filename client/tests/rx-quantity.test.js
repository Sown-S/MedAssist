import { describe, it, expect } from 'vitest'
import { wholeQty } from '../src/renderer/src/pages/doctor/consult/rxDraft.js'
import { finalizeCheck } from '../src/renderer/src/pages/doctor/consult/finalizeCheck.js'

// Số lượng trên đơn là số nguyên dương: số lẻ / chữ lẫn số bị chặn khi chốt, không bị cắt thành số nguyên rồi lưu.
describe('Số lượng thuốc trên đơn', () => {
  it('chỉ nhận số nguyên dương', () => {
    expect(wholeQty('10')).toBe(10)
    expect(wholeQty(' 3 ')).toBe(3)
    expect(wholeQty(2)).toBe(2)
    for (const bad of ['1.5', '1,5', '2a', '0', '', '-1', null, undefined]) expect(wholeQty(bad)).toBe(0)
  })

  it('số lượng lẻ → chặn chốt đơn với câu báo rõ, không lưu thành 1', () => {
    const visit = { age: 30 }
    const d = { diagnosis: 'J03.9 — Viêm amidan cấp', vitals: {}, rx: [{ name: 'Amoxicilin 500 mg', qty: '1.5', usage: 'Uống sau ăn' }] }
    expect(finalizeCheck(visit, d).problem).toBe('Enter a whole-number quantity and the directions for every drug.')
    expect(finalizeCheck(visit, { ...d, rx: [{ ...d.rx[0], qty: '2' }] }).problem).toBe(null)
  })
})
