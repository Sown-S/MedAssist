import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { act, cleanup, renderHook, screen } from '@testing-library/react'
import { DOC_A, DESK } from './helpers'
import { installFakeServer, overrideRoute } from './fakeServer'

// Mất kết nối máy chủ (NFR08): /health không trả lời hoặc trả 503 → chế độ chỉ đọc, có lại thì tự mở.
// connectivity.js giữ trạng thái ở mức module (hỏi /health 3 giây một lần) → nạp lại module cho từng test.
let restore = () => {}
let conn
beforeEach(async () => {
  installFakeServer()
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  vi.resetModules()
  conn = await import('../src/renderer/src/api/connectivity.js')
})
afterEach(() => {
  restore()
  restore = () => {}
  cleanup()
})
afterAll(() => vi.unstubAllGlobals())

// Một nhịp hỏi /health (3 giây) và chờ câu trả lời xử lý xong.
const nextProbe = () => act(() => vi.advanceTimersByTimeAsync(3000))
const settle = () => act(() => vi.advanceTimersByTimeAsync(0))
const health = (fn) => {
  restore()
  restore = overrideRoute(/^\/health$/, fn)
}
const down = () => {
  throw new TypeError('Failed to fetch')
}

describe('Theo dõi /health', () => {
  it('mất mạng → chỉ đọc; có lại → tự mở', async () => {
    const { result } = renderHook(() => conn.useServerOnline())
    await settle()
    expect(result.current).toBe(true)
    health(down)
    await nextProbe()
    expect(result.current).toBe(false)
    expect(conn.isServerOnline()).toBe(false)
    health(() => ({ status: 'healthy', database: { ok: true }, ai: { ok: true } }))
    await nextProbe()
    expect(result.current).toBe(true)
  })

  it('503 (CSDL lỗi, server vẫn trả lời) cũng tính là mất kết nối', async () => {
    health(() => ({ status: 503, body: { status: 'unhealthy', database: { ok: false }, ai: { ok: null } } }))
    const { result } = renderHook(() => conn.useServerOnline())
    await settle()
    expect(result.current).toBe(false)
  })

  it('trạng thái AI đọc theo mã reason; ok = null (chưa kiểm) thì giữ trạng thái cũ', async () => {
    health(() => ({ database: { ok: true }, ai: { ok: false, reason: 'disabled', detail: 'LLM đang tắt' } }))
    const { result } = renderHook(() => conn.useAiHealth())
    await settle()
    expect(result.current).toEqual({ ok: false, reason: 'disabled', detail: 'LLM đang tắt' })
    health(() => ({ database: { ok: true }, ai: { ok: null } }))
    await nextProbe()
    expect(result.current.reason).toBe('disabled')
    health(() => ({ database: { ok: true }, ai: { ok: true } }))
    await nextProbe()
    expect(result.current.ok).toBe(true)
  })

  it('server cũ không gửi reason → coi như AI tạm hỏng (unreachable), không phải tắt hẳn', async () => {
    health(() => ({ database: { ok: true }, ai: { ok: false, detail: 'Ollama không trả lời' } }))
    const { result } = renderHook(() => conn.useAiHealth())
    await settle()
    expect(result.current.reason).toBe('unreachable')
  })
})

describe('Banner chỉ đọc trên giao diện', () => {
  const BANNER = 'No connection to the clinic server — read-only mode'

  it('bác sĩ: banner chung hiện khi mất kết nối, tắt khi có lại', async () => {
    const { renderPage } = await import('./render.jsx')
    const { Shell } = await import('../src/renderer/src/App.jsx')
    renderPage(<Shell />, { user: DOC_A, path: '/doctor' })
    await settle()
    expect(screen.queryByText(BANNER)).toBeNull()
    health(down)
    await nextProbe()
    expect(screen.getByText(BANNER)).toBeTruthy()
    restore()
    await nextProbe()
    expect(screen.queryByText(BANNER)).toBeNull()
  })

  it('lễ tân: banner riêng và khoá nút tiếp đón bệnh nhân mới', async () => {
    const { renderPage } = await import('./render.jsx')
    const { default: Reception } = await import('../src/renderer/src/pages/Reception.jsx')
    health(down)
    renderPage(<Reception />, { user: DESK, path: '/reception' })
    await settle()
    expect(screen.getByText(BANNER)).toBeTruthy()
    // Nút ở đầu trang và ở trang chủ quầy đều bị khoá.
    const buttons = screen.getAllByText(/Register new patient/).map((el) => el.closest('button'))
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b.disabled).toBe(true)
  })
})
