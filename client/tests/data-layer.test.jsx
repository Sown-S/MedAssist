import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { ApiError } from '../src/renderer/src/api/client.js'
import { errorMessage, failure, isStaleConflict, STALE_MESSAGE } from '../src/renderer/src/api/errors.js'
import { useAwaiting, useTodayInvoices } from '../src/renderer/src/api/billingApi.js'
import { usePrescriptions } from '../src/renderer/src/api/prescriptionApi.js'
import { installFakeServer, resetCalls, calls, overrideRoute } from './fakeServer'
import { useApiData } from '../src/renderer/src/hooks/useApiData.js'

const err = (status, code, message, details) => new ApiError(status, { error: { code, message, details } })

describe('Lỗi API tập trung', () => {
  it('409 chuyển trạng thái (details.field=status) là xung đột dữ liệu cũ', () => {
    const e = err(409, 'CONFLICT', 'Lượt đã chuyển trạng thái', [{ field: 'status', current: 'Finished', allowed_from: ['Examining'] }])
    expect(isStaleConflict(e)).toBe(true)
    expect(errorMessage(e)).toBe(`Lượt đã chuyển trạng thái ${STALE_MESSAGE}`)
  })
  it('409 nghiệp vụ (thiếu kho, có lượt mở) không phải dữ liệu cũ, giữ câu của server', () => {
    const e = err(409, 'STOCK_SHORTAGE', 'Không đủ tồn kho')
    expect(isStaleConflict(e)).toBe(false)
    expect(errorMessage(e)).toBe('Không đủ tồn kho')
  })
  it('VISIT_TAKEN → đồng bộ lại và đánh dấu stale', () => {
    const resync = vi.fn()
    expect(failure(err(409, 'VISIT_TAKEN', 'Bác sĩ khác đã nhận'), { resync })).toEqual({ ok: false, error: `Bác sĩ khác đã nhận ${STALE_MESSAGE}`, stale: true })
    expect(resync).toHaveBeenCalledOnce()
  })
  it('Lỗi 400 không đồng bộ lại, giữ dạng { ok, error } cũ', () => {
    const resync = vi.fn()
    expect(failure(err(400, 'VALIDATION_ERROR', 'Thiếu lý do'), { resync })).toEqual({ ok: false, error: 'Thiếu lý do' })
    expect(resync).not.toHaveBeenCalled()
  })
  it('Mất mạng (fetch ném TypeError) và HTTP trống có câu dễ hiểu', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe('Cannot reach the server. Check the connection and try again.')
    expect(errorMessage(new ApiError(500, null), 'Không tải được')).toBe('Không tải được')
  })
})

describe('Hook đọc dữ liệu qua TanStack Query', () => {
  beforeAll(() => installFakeServer())
  beforeEach(() => resetCalls())
  afterAll(() => vi.unstubAllGlobals())
  const hits = (p) => calls.filter((c) => c.method === 'GET' && c.path === p).length

  it('usePrescriptions trả { list, loaded, error } như trước, đã qua fromServerRx', async () => {
    const { result } = renderHook(() => usePrescriptions({ from: '2026-01-01', to: '2026-12-31' }))
    expect(result.current).toMatchObject({ list: [], loaded: false, error: null })
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.list[0]).toMatchObject({ visitId: 'v-paid-wait', status: 'Confirmed' })
  })
  it('Hai màn hình cùng dùng useAwaiting chỉ gọi server một lần (dùng chung cache)', async () => {
    const a = renderHook(() => useAwaiting())
    const b = renderHook(() => useAwaiting())
    await waitFor(() => expect(a.result.current.loaded && b.result.current.loaded).toBe(true))
    expect(hits('/api/v1/billing/awaiting')).toBe(1)
    await a.result.current.reload()
    expect(hits('/api/v1/billing/awaiting')).toBe(2)
  })
  it('enabled=false không gọi server; useTodayInvoices là null tới khi tải xong', async () => {
    const off = renderHook(() => useAwaiting({ enabled: false }))
    expect(off.result.current.loaded).toBe(false)
    const inv = renderHook(() => useTodayInvoices())
    expect(inv.result.current).toBe(null)
    await waitFor(() => expect(inv.result.current).not.toBe(null))
    expect(hits('/api/v1/billing/awaiting')).toBe(0)
  })

  it('useApiData: lỗi server thành câu hiển thị, reload() gọi lại và hết lỗi', async () => {
    let fail = true
    const undo = overrideRoute(/\/api\/v1\/reports\/x$/, () => (fail ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ' } } } : { ok: 1 }))
    const { result } = renderHook(() => useApiData('/api/v1/reports/x'))
    await waitFor(() => expect(result.current.error).toBe('Lỗi máy chủ'))
    expect(result.current.loading).toBe(false)
    fail = false
    await result.current.reload()
    await waitFor(() => expect(result.current).toMatchObject({ data: { ok: 1 }, error: null }))
    undo()
  })
  it('useApiData(null) không gọi server', () => {
    const { result } = renderHook(() => useApiData(null))
    expect(result.current).toMatchObject({ data: null, loading: false, error: null })
  })
})
