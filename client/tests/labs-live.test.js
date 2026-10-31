import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DOC_A, DOC_B } from './helpers'

// Chạy queueStore như khi nối server thật (VITE_USE_MOCK=false), thay các lời gọi API bằng một "server" nhỏ trong bộ nhớ
// làm đúng luật của backend (ERD v2.0 / v2.1): start-exam CheckedIn → Examining; đi xét nghiệm là cột lab_out_at do
// server giữ (lập phiếu chỉ định tự đặt, lab-return xoá); release / huỷ / chốt đơn xoá cột này. Máy client không tự lưu cờ.
let server
let api
let queue
let current = DOC_A // bác sĩ đang thao tác ở máy này (server ghi người nhận khám theo token)

async function load() {
  vi.resetModules()
  vi.doMock('../src/renderer/src/api/clinicApi.js', () => api)
  queue = await import('../src/renderer/src/api/queueStore.js')
  await queue.syncQueue()
}

beforeEach(async () => {
  localStorage.clear()
  vi.stubEnv('VITE_USE_MOCK', 'false')
  current = DOC_A
  server = [
    { id: 'v1', ticket: 1, name: 'Bệnh nhân 1', status: 'CheckedIn', doctor: '', doctorId: null, room: '', labOut: false },
    { id: 'v2', ticket: 2, name: 'Bệnh nhân 2', status: 'CheckedIn', doctor: '', doctorId: null, room: '', labOut: false }
  ]
  const find = (id) => server.find((v) => v.id === id)
  const mine = (id) => {
    const v = find(id)
    if (v.status !== 'Examining' || v.doctorId !== current.id) throw new Error('Lượt khám không phải của bác sĩ này')
    return v
  }
  api = {
    fetchQueue: vi.fn(async () => server.map((v) => ({ ...v }))),
    fetchStale: vi.fn(async () => []),
    cancelStale: vi.fn(async () => {}),
    startExam: vi.fn(async (id) => {
      const v = find(id)
      if (v.status !== 'CheckedIn') throw new Error('Lượt khám đã có bác sĩ khác nhận')
      Object.assign(v, { status: 'Examining', doctor: current.name, doctorId: current.id, room: current.room })
    }),
    labOut: vi.fn(async (id) => Object.assign(mine(id), { labOut: true })),
    labReturn: vi.fn(async (id) => Object.assign(mine(id), { labOut: false })),
    releaseVisit: vi.fn(async (id) => Object.assign(find(id), { status: 'CheckedIn', doctor: '', doctorId: null, room: '', labOut: false })),
    cancelVisit: vi.fn(async (id) => Object.assign(find(id), { status: 'Cancelled', labOut: false })),
    checkIn: vi.fn(async () => {})
  }
  await load()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('../src/renderer/src/api/clinicApi.js')
})

const visit = (id) => queue.getQueue().visits.find((v) => v.id === id)
// Bác sĩ A nhận v1 rồi lập phiếu chỉ định trên server (POST service-orders đặt lab_out_at), máy đồng bộ lại.
async function sendV1ToLabs() {
  expect((await queue.takePatient('v1', DOC_A)).ok).toBe(true)
  server[0].labOut = true
  await queue.syncQueue()
}

describe('Đi xét nghiệm khi chạy với server thật (server giữ cờ)', () => {
  it('nhận khám gọi start-exam đúng một lần, phòng lấy từ server', async () => {
    await sendV1ToLabs()
    expect(api.startExam).toHaveBeenCalledTimes(1)
    expect(visit('v1').room).toBe('Phòng khám 01')
  })

  it('server báo bác sĩ khác đã nhận → báo lỗi, không đổi gì', async () => {
    server[0].status = 'Examining'
    const r = await queue.takePatient('v1', DOC_A)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/bác sĩ khác/)
  })

  it('cờ "đang xét nghiệm" đọc từ server: máy nào đồng bộ cũng thấy', async () => {
    await sendV1ToLabs()
    expect(queue.atLabs(visit('v1'))).toBe(true)
    expect(queue.inRoomOf(DOC_A)).toHaveLength(0)
  })

  it('không còn lưu cờ xét nghiệm trên máy (localStorage) — tải lại app vẫn đúng vì đọc từ server', async () => {
    await sendV1ToLabs()
    expect(localStorage.getItem('medassist_lab_local_v1')).toBeNull()
    await load()
    expect(queue.atLabs(visit('v1'))).toBe(true)
  })

  it('"Khám tiếp" báo server bệnh nhân đã về (lab-return), không gọi lại start-exam', async () => {
    await sendV1ToLabs()
    const r = await queue.takePatient('v1', DOC_A)
    expect(r.ok).toBe(true)
    expect(api.labReturn).toHaveBeenCalledWith('v1')
    expect(api.startExam).toHaveBeenCalledTimes(1)
    expect(queue.inRoom(visit('v1'))).toBe(true)
    expect(visit('v1').entered).toBe(true)
  })

  it('"Khám tiếp" sau khi mở lại app vẫn chạy', async () => {
    await sendV1ToLabs()
    await load()
    expect((await queue.takePatient('v1', DOC_A)).ok).toBe(true)
    expect(queue.inRoom(visit('v1'))).toBe(true)
  })

  it('máy khác trả bệnh nhân về hàng chờ → server bỏ cờ, máy này hết thấy "đang xét nghiệm"', async () => {
    await sendV1ToLabs()
    Object.assign(server[0], { status: 'CheckedIn', doctor: '', doctorId: null, labOut: false })
    await queue.syncQueue()
    expect(visit('v1')).toMatchObject({ status: 'CheckedIn', labOut: false })
  })

  it('bác sĩ khác không nhận được bệnh nhân đang đi xét nghiệm của bác sĩ A', async () => {
    await sendV1ToLabs()
    const r = await queue.takePatient('v1', DOC_B)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/lab tests under another doctor/)
  })

  it('gọi khám tiếp mà bệnh nhân chưa vào → báo lại server đi xét nghiệm (lab-out)', async () => {
    await sendV1ToLabs()
    await queue.takePatient('v1', DOC_A)
    // Trạng thái "đang mời" của lần khám tiếp: bác sĩ bấm "Không có mặt".
    queue.getQueue().visits.find((v) => v.id === 'v1').entered = false
    expect(queue.markNotPresent('v1', DOC_A).ok).toBe(true)
    await vi.waitFor(() => expect(api.labOut).toHaveBeenCalledWith('v1'))
  })

  it('bác sĩ đóng lượt "không quay lại": gọi API huỷ với lý do tiếng Việt', async () => {
    await sendV1ToLabs()
    const r = await queue.leaveVisit('v1', { reason: 'no_return', note: 'gọi 2 lần' }, DOC_A)
    expect(r.ok).toBe(true)
    expect(api.cancelVisit).toHaveBeenCalledWith('v1', expect.stringContaining('gọi 2 lần'))
    expect(api.cancelVisit.mock.calls[0][1]).not.toMatch(/Did not come back/)
    expect(visit('v1').status).toBe('Cancelled')
  })

  it('đang có người đi xét nghiệm vẫn mời được bệnh nhân khác (start-exam cho người mới)', async () => {
    await sendV1ToLabs()
    expect((await queue.takePatient('v2', DOC_A)).ok).toBe(true)
    expect(api.startExam).toHaveBeenLastCalledWith('v2')
  })

  it('server từ chối "khám tiếp" (lab-return) → bác sĩ thấy lỗi, bệnh nhân vẫn ở nhóm đi xét nghiệm', async () => {
    await sendV1ToLabs()
    api.labReturn.mockRejectedValueOnce(new Error('Lượt khám không phải của bác sĩ này'))
    const r = await queue.takePatient('v1', DOC_A)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/không phải của bác sĩ này/)
    expect(queue.atLabs(visit('v1'))).toBe(true)
  })
})
