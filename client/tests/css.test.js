// Giữ CSS gọn: không biến CSS gõ nhầm / bỏ quên, không luật có class không còn dùng, không khai báo bị ghi đè hoàn toàn.
import { describe, it, expect } from 'vitest'
import { scan as vars } from '../scripts/css/vars.mjs'
import { scan as unused } from '../scripts/css/unused.mjs'
import { scan as shadowed } from '../scripts/css/shadowed.mjs'

describe('CSS', () => {
  it('mọi var(--x) đều có khai báo và không còn token chết', () => {
    expect(vars()).toEqual({ undefined: [], unused: [] })
  })
  it('không luật nào chỉ chứa class không còn dùng (node scripts/css/unused.mjs --remove)', () => {
    expect(unused()).toEqual([])
  })
  it('không khai báo nào bị luật sau cùng selector ghi đè hoàn toàn (node scripts/css/shadowed.mjs --remove)', () => {
    expect(shadowed()).toEqual([])
  })
})
