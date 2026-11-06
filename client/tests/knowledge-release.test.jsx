import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { renderPage } from './render.jsx'
import ReleaseTab from '../src/renderer/src/pages/admin/knowledge/ReleaseTab.jsx'
import { ReviewPanel } from '../src/renderer/src/pages/admin/knowledge/ReviewPanel.jsx'
import { ADMIN, DOC_A } from './helpers'
import { installFakeServer, resetCalls, calls, overrideRoute } from './fakeServer'

// Bản phát hành tri thức (FR11): admin soạn → gửi duyệt → bác sĩ khác người soạn duyệt / trả lại cả bản.
const BASE = '/api/v1/admin/knowledge'
const year = new Date().getFullYear()
const release = (status, extra = {}) => ({ release_id: 'rel1', label: `KB-${year}.08`, status, description: 'Sửa tên triệu chứng', created_at: '2026-11-01T08:00:00Z', ...extra })
const OLD = { release_id: 'rel0', label: `KB-${year}.07`, status: 'Active', created_at: '2026-10-01T08:00:00Z' }
// Một mục đổi tên: đang dùng “Ho”, bản nháp “Ho khan”.
const CHANGE = { kind: 'symptoms', key: 'cough_dry', version: 2, action: 'changed', values: { symptom_code: 'cough_dry', symptom_name: 'Ho khan', category: 'respiratory' }, active_values: { symptom_code: 'cough_dry', symptom_name: 'Ho', category: 'respiratory' } }
const names = { condition: {}, symptom: {} }

let restore = []
const detail = (changes) => restore.push(overrideRoute(/^\/api\/v1\/admin\/knowledge\/releases\/rel1$/, () => ({ ...release('Draft'), changes })))
const sent = (method, path) => calls.filter((c) => c.method === method && c.path === path)

beforeAll(() => installFakeServer())
beforeEach(() => resetCalls())
afterEach(() => {
  restore.forEach((r) => r())
  restore = []
  cleanup()
})
afterAll(() => vi.unstubAllGlobals())

describe('Admin soạn bản phát hành', () => {
  it('chưa có thay đổi → chưa gửi duyệt được; có thay đổi → hiện so sánh cũ / mới và gửi duyệt', async () => {
    detail([])
    const onChanged = vi.fn()
    const view = renderPage(<ReleaseTab data={{ releases: [OLD, release('Draft')], sources: [] }} names={names} onChanged={onChanged} />, { user: ADMIN })
    expect(await screen.findByText('No changes yet')).toBeTruthy()
    expect(screen.getByText('Submit for doctor review').closest('button').disabled).toBe(true)
    view.unmount()

    restore.forEach((r) => r())
    restore = []
    detail([CHANGE])
    renderPage(<ReleaseTab data={{ releases: [OLD, release('Draft')], sources: [] }} names={names} onChanged={onChanged} />, { user: ADMIN })
    expect(await screen.findByText('Ho khan')).toBeTruthy()
    expect(screen.getByText('Ho', { selector: '.kb-old *' })).toBeTruthy()
    fireEvent.click(screen.getByText('Submit for doctor review'))
    await waitFor(() => expect(sent('POST', `${BASE}/releases/rel1/submit`)).toHaveLength(1))
    expect(onChanged).toHaveBeenCalled()
  })

  it('bỏ một mục khỏi bản nháp → xoá nháp của đúng mục', async () => {
    detail([CHANGE])
    renderPage(<ReleaseTab data={{ releases: [release('Draft')], sources: [] }} names={names} onChanged={() => {}} />, { user: ADMIN })
    fireEvent.click(await screen.findByText('Remove from release'))
    await waitFor(() => expect(sent('DELETE', `${BASE}/symptoms/cough_dry/draft`)).toHaveLength(1))
  })

  it('bác sĩ trả lại → hiện ghi chú của bác sĩ', async () => {
    detail([CHANGE])
    renderPage(<ReleaseTab data={{ releases: [release('Draft', { review_note: 'Thiếu nguồn' })], sources: [] }} names={names} onChanged={() => {}} />, { user: ADMIN })
    expect(await screen.findByText('Returned by the doctor:')).toBeTruthy()
    expect(screen.getAllByText('Thiếu nguồn').length).toBeGreaterThan(0)
  })

  it('mở bản mới: gợi ý nhãn kế tiếp theo năm, gửi mô tả trống là null', async () => {
    renderPage(<ReleaseTab data={{ releases: [OLD], sources: [] }} names={names} onChanged={() => {}} />, { user: ADMIN })
    fireEvent.click(screen.getByText('+ Open a release'))
    expect(screen.getByDisplayValue(`KB-${year}.08`)).toBeTruthy()
    fireEvent.click(screen.getByText('Open release'))
    await waitFor(() => expect(sent('POST', `${BASE}/releases`)).toHaveLength(1))
    expect(sent('POST', `${BASE}/releases`)[0].body).toEqual({ label: `KB-${year}.08`, description: null })
  })
})

describe('Bác sĩ duyệt bản phát hành', () => {
  const pending = { releases: [release('PendingApproval', { submitted_at: '2026-11-02T08:00:00Z' })], sources: [] }

  it('duyệt: hỏi xác nhận, ghi số thay đổi, rồi gửi approve', async () => {
    detail([CHANGE])
    renderPage(<ReviewPanel data={pending} names={names} onChanged={() => {}} />, { user: DOC_A })
    await screen.findByText('Ho khan')
    fireEvent.click(screen.getByText('Approve release'))
    expect(document.querySelector('.ai-confirm-msg b').textContent).toBe('1')
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(sent('POST', `${BASE}/releases/rel1/approve`)).toHaveLength(1))
  })

  it('trả lại: bắt ghi lý do ≥ 3 ký tự, gửi kèm lý do', async () => {
    detail([CHANGE])
    renderPage(<ReviewPanel data={pending} names={names} onChanged={() => {}} />, { user: DOC_A })
    await screen.findByText('Ho khan')
    fireEvent.click(screen.getByText('Reject'))
    const reject = screen.getAllByText('Reject').map((el) => el.closest('button')).find((b) => b.classList.contains('btn-danger'))
    expect(reject.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('At least 3 characters'), { target: { value: 'Thiếu nguồn' } })
    fireEvent.click(reject)
    await waitFor(() => expect(sent('POST', `${BASE}/releases/rel1/reject`)).toHaveLength(1))
    expect(sent('POST', `${BASE}/releases/rel1/reject`)[0].body).toEqual({ note: 'Thiếu nguồn' })
  })

  it('người soạn tự duyệt (409 APPROVER_IS_AUTHOR) → hiện câu lỗi của server', async () => {
    detail([CHANGE])
    restore.push(overrideRoute(/\/releases\/rel1\/approve$/, () => ({ status: 409, body: { error: { code: 'APPROVER_IS_AUTHOR', message: 'Người duyệt phải khác người soạn' } } }), 'POST'))
    renderPage(<ReviewPanel data={pending} names={names} onChanged={() => {}} />, { user: DOC_A })
    await screen.findByText('Ho khan')
    fireEvent.click(screen.getByText('Approve release'))
    fireEvent.click(screen.getByText('Approve'))
    expect((await screen.findAllByText('Người duyệt phải khác người soạn')).length).toBeGreaterThan(0)
  })
})
