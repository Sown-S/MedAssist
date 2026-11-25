import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkShape, setShapeReporter } from '../src/renderer/src/api/validate.js'
import { QueueItem } from '../src/renderer/src/api/schemas.gen.js'
import { z } from 'zod'

afterEach(() => setShapeReporter(null))

describe('checkShape', () => {
  it('Không bao giờ chặn dữ liệu, chỉ báo một lần mỗi endpoint', () => {
    const report = vi.fn()
    setShapeReporter(report)
    const bad = [{ visit_id: 1 }]
    expect(checkShape(z.array(QueueItem), bad, 'GET /queue')).toBe(bad)
    checkShape(z.array(QueueItem), bad, 'GET /queue')
    expect(report).toHaveBeenCalledOnce()
    expect(report.mock.calls[0][0]).toBe('GET /queue')
    expect(report.mock.calls[0][1].length).toBeGreaterThan(0)
  })
  it('Tắt reporter (bản phát hành) thì không kiểm', () => {
    const spy = vi.spyOn(QueueItem, 'safeParse')
    checkShape(QueueItem, {}, 'x')
    expect(spy).not.toHaveBeenCalled()
  })
})
