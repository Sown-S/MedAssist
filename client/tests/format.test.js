import { describe, it, expect } from 'vitest'
import { ymd, hhmm, dmy, fmtDate, fmtDateTime, fmtNum, money, fmtMoney, vnd, fold } from '../src/renderer/src/utils/format.js'

const at = new Date(2026, 2, 4, 7, 5, 9) // 04/03/2026 07:05:09 giờ máy

describe('utils/format', () => {
  it('ngày giờ', () => {
    expect(ymd(at)).toBe('2026-03-04')
    expect(ymd()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(hhmm(at)).toBe('07:05')
    expect(dmy(at)).toBe('04/03/2026')
    expect(fmtDate('2026-03-04')).toBe('04/03/2026')
    expect(fmtDate('2026-03-04T23:59:00Z')).toBe('04/03/2026') // cắt chuỗi, không đổi múi giờ
    expect(fmtDate(null)).toBe('—')
    expect(fmtDateTime(at)).toBe('04/03/2026 07:05')
    expect(fmtDateTime(at, { seconds: true })).toBe('04/03/2026 07:05:09')
    expect(fmtDateTime('')).toBe('—')
  })

  it('số và tiền', () => {
    expect(fmtNum(1250)).toBe('1.250')
    expect(fmtNum(NaN)).toBe('—')
    expect(money(1250)).toBe('1.250 đ')
    expect(money(-500)).toBe('−500 đ')
    expect(money('abc')).toBe('0 đ')
    expect(fmtMoney(1249.6)).toBe('1.250 đ')
    expect(fmtMoney(undefined)).toBe('—')
    expect(vnd(1249.6)).toBe('1.250đ')
  })

  it('bỏ dấu để tìm kiếm', () => {
    expect(fold('  Nguyễn   Đức ')).toBe('nguyen duc')
  })
})
