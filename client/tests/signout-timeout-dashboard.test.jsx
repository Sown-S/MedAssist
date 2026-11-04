import { describe, it, expect, afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { renderPage } from './render.jsx'
import { Shell } from '../src/renderer/src/App.jsx'
import Admin from '../src/renderer/src/pages/Admin.jsx'
import { countOf } from '../src/renderer/src/pages/admin/DashboardPage.jsx'
import { syncQueue } from '../src/renderer/src/api/queueStore.js'
import { saveDraft, getDraft } from '../src/renderer/src/api/draftStore.js'
import { DOC_A, DOC_B, DESK, ADMIN } from './helpers'
import { installFakeServer } from './fakeServer'

const KEY = 'medassist_consult_drafts_v1'
const flush = () => new Promise((ok) => setTimeout(ok, 450)) // draftStore gom lần ghi 400 ms

// ===== Việc 4: bản nháp phiếu khám + chặn đăng xuất khi còn ca =====
describe('Bản nháp phiếu khám trên máy (draftStore)', () => {
  let store
  beforeEach(async () => {
    localStorage.clear()
    vi.resetModules()
    store = await import('../src/renderer/src/api/draftStore.js')
  })
  afterEach(() => vi.useRealTimers())

  it('đăng xuất chủ động → xoá cả trong bộ nhớ lẫn trên đĩa', async () => {
    store.claimDrafts('bs-a')
    store.saveDraft('v1', { exam: 'Họng đỏ' })
    await flush()
    expect(localStorage.getItem(KEY)).toContain('Họng đỏ')
    store.clearDrafts()
    expect(store.getDraft('v1')).toBeUndefined()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('cùng bác sĩ đăng nhập lại (sau khi tự đăng xuất) → còn bản nháp; người khác đăng nhập → xoá', async () => {
    store.claimDrafts('bs-a')
    store.saveDraft('v1', { exam: 'Họng đỏ' })
    store.claimDrafts('bs-a')
    expect(store.getDraft('v1')).toEqual({ exam: 'Họng đỏ' })
    store.claimDrafts('bs-b')
    expect(store.getDraft('v1')).toBeUndefined()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('mở app sang ngày mới → bản của hôm trước bị xoá khỏi đĩa ngay', async () => {
    localStorage.setItem(KEY, JSON.stringify({ day: '2000-01-01', owner: 'bs-a', drafts: { v1: { exam: 'cũ' } } }))
    vi.resetModules()
    store = await import('../src/renderer/src/api/draftStore.js')
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(store.getDraft('v1')).toBeUndefined()
  })

  it('app để mở qua đêm → bản hôm qua không được ghi lại với ngày hôm nay', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 4, 23, 59))
    vi.resetModules()
    store = await import('../src/renderer/src/api/draftStore.js')
    store.saveDraft('v1', { exam: 'hôm qua' })
    vi.setSystemTime(new Date(2026, 10, 5, 7, 0))
    expect(store.getDraft('v1')).toBeUndefined()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('Đăng xuất của bác sĩ', () => {
  beforeAll(() => installFakeServer())
  afterEach(() => cleanup())
  afterAll(() => vi.unstubAllGlobals())

  it('còn bệnh nhân trong phòng → không đăng xuất được, có nút mở lượt khám', async () => {
    await syncQueue()
    renderPage(<Shell />, { user: DOC_A, path: '/doctor' })
    fireEvent.click(await screen.findByText('Sign out', { selector: '.logout-btn' }))
    expect(await screen.findByText('Finish your visits before signing out')).toBeTruthy()
    const row = screen.getByText('Nguyễn Văn An', { selector: '.signout-row b' }).closest('.signout-row')
    expect(row.textContent).toContain('In my room')
    expect(row.textContent).toContain('Open visit')
    expect(screen.getByText('Sign out', { selector: '.modal-foot button' }).disabled).toBe(true)
    expect(screen.queryByText('Sign out anyway')).toBeNull()
  })

  it('bệnh nhân đi xét nghiệm không quay lại → đóng lượt ngay từ hộp thoại', async () => {
    await syncQueue()
    renderPage(<Shell />, { user: DOC_B, path: '/doctor' })
    fireEvent.click(await screen.findByText('Sign out', { selector: '.logout-btn' }))
    const row = (await screen.findByText('Hoàng Thị Em', { selector: '.signout-row b' })).closest('.signout-row')
    expect(row.textContent).toContain('Out for lab tests')
    fireEvent.click(screen.getByText('Did not come back'))
    expect(await screen.findByText(/Patient left — Hoàng Thị Em/)).toBeTruthy()
  })

  it('không còn ca → đăng xuất ngay và xoá bản nháp trên máy', async () => {
    saveDraft('v-old', { exam: 'nháp' })
    await flush()
    renderPage(<Shell />, { user: DESK, path: '/reception' })
    fireEvent.click(await screen.findByText('Sign out', { selector: '.logout-btn' }))
    await waitFor(() => expect(getDraft('v-old')).toBeUndefined())
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

// ===== Việc 5: giới hạn chờ 45 giây, báo chậm sau 10 giây =====
describe('Gọi server có giới hạn thời gian', () => {
  let client
  beforeEach(async () => {
    vi.resetModules()
    client = await import('../src/renderer/src/api/client.js')
    // Server treo: không bao giờ trả lời, chỉ dừng khi bị huỷ.
    vi.stubGlobal(
      'fetch',
      vi.fn((url, { signal }) => new Promise((_, fail) => signal.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')))))
    )
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('quá 10 giây → bật cờ "đang chậm"; quá 45 giây → lỗi TIMEOUT kèm câu báo, tắt cờ', async () => {
    const p = client.apiGet('/api/v1/queue')
    const settled = p.catch((e) => e)
    await vi.advanceTimersByTimeAsync(9900)
    expect(client.isServerSlow()).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(client.isServerSlow()).toBe(true)
    await vi.advanceTimersByTimeAsync(35000)
    const e = await settled
    expect(e).toBeInstanceOf(client.ApiError)
    expect(e.code).toBe('TIMEOUT')
    expect(e.message).toBe(client.TIMEOUT_MESSAGE)
    expect(client.isServerSlow()).toBe(false)
  })

  it('bên gọi tự huỷ → lỗi huỷ bình thường, không báo TIMEOUT', async () => {
    const c = new AbortController()
    const settled = client.timedFetch('http://x/api', { signal: c.signal }).catch((e) => e)
    c.abort()
    const e = await settled
    expect(e.name).toBe('AbortError')
    expect(client.isServerSlow()).toBe(false)
  })
})

// ===== Việc 6: Dashboard Admin không hiện NaN =====
describe('Dashboard Admin', () => {
  beforeAll(() => installFakeServer())
  afterEach(() => cleanup())
  afterAll(() => vi.unstubAllGlobals())

  it('trạng thái server không gửi tính là 0', () => {
    expect(countOf({ Waiting: 2 }, 'Waiting', 'CheckedIn')).toBe(2)
    expect(countOf({}, 'Prescribed')).toBe(0)
  })

  it('ô "Đang chờ khám" ra số, không phải NaN (hôm nay chưa ai check-in)', async () => {
    renderPage(<Admin onNavigate={() => {}} />, { user: ADMIN, path: '/admin' })
    const card = (await screen.findByText('Waiting for consultation')).closest('.stat-card')
    await waitFor(() => expect(card.querySelector('.val').textContent).toBe('1'))
    expect(screen.getByText('Awaiting payment').closest('.stat-card').querySelector('.val').textContent).toBe('0')
    expect(document.body.textContent).not.toContain('NaN')
  })
})
