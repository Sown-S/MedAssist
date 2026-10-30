import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DOC_A, DOC_B } from './helpers'

// Chạy queueStore như khi nối server thật (VITE_USE_MOCK=false), thay các lời gọi API bằng một "server" nhỏ trong bộ nhớ
// làm đúng luật của backend: start-exam CheckedIn → Examining, release → CheckedIn, GET /queue không có cờ đi xét nghiệm.
let server
let api
let queue

const CBC = { code: 'XN01', name: 'Công thức máu', group: 'hematology', sample: 'blood' }

async function load() {
  vi.resetModules()
  vi.doMock('../src/renderer/src/api/clinicApi.js', () => api)
  queue = await import('../src/renderer/src/api/queueStore.js')
  await queue.syncQueue()
}

beforeEach(async () => {
  localStorage.clear()
  vi.stubEnv('VITE_USE_MOCK', 'false')
  server = [
    { id: 'v1', ticket: 1, name: 'Bệnh nhân 1', status: 'CheckedIn', doctor: '', doctorId: null, room: '' },
    { id: 'v2', ticket: 2, name: 'Bệnh nhân 2', status: 'CheckedIn', doctor: '', doctorId: null, room: '' }
  ]
  const find = (id) => server.find((v) => v.id === id)
  api = {
    fetchQueue: vi.fn(async () => server.map((v) => ({ ...v }))),
    startExam: vi.fn(async (id) => {
      const v = find(id)
      if (v.status !== 'CheckedIn') throw new Error('Lượt khám đã có bác sĩ khác nhận')
      Object.assign(v, { status: 'Examining', doctor: current.name, doctorId: current.id, room: current.room })
    }),
    releaseVisit: vi.fn(async (id) => Object.assign(find(id), { status: 'CheckedIn', doctor: '', doctorId: null, room: '' })),
    cancelVisit: vi.fn(async (id) => Object.assign(find(id), { status: 'Cancelled' })),
    checkIn: vi.fn(async () => {})
  }
  await load()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('../src/renderer/src/api/clinicApi.js')
})

// Bác sĩ đang thao tác ở máy này (server ghi người nhận khám theo token).
let current = DOC_A
const visit = (id) => queue.getQueue().visits.find((v) => v.id === id)

async function sendV1ToLabs() {
  current = DOC_A
  expect((await queue.takePatient('v1', DOC_A)).ok).toBe(true)
  expect(queue.sendToLabs('v1', { tests: [CBC] }, DOC_A).ok).toBe(true)
}

describe('Đi xét nghiệm khi chạy với server thật', () => {
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

  it('đồng bộ 3 giây/lần không làm mất cờ đi xét nghiệm (server không lưu cờ này)', async () => {
    await sendV1ToLabs()
    await queue.syncQueue()
    await queue.syncQueue()
    expect(queue.atLabs(visit('v1'))).toBe(true)
    expect(visit('v1').labOrders).toHaveLength(1)
  })

  it('tắt app mở lại (tải lại trang) vẫn còn bệnh nhân đang đi xét nghiệm và phiếu chỉ định', async () => {
    await sendV1ToLabs()
    await load()
    expect(queue.atLabs(visit('v1'))).toBe(true)
    expect(visit('v1').labOrders[0].tests[0].code).toBe('XN01')
  })

  it('"Khám tiếp" KHÔNG gọi lại start-exam (server sẽ trả 409) và không hiện thanh "quầy đang gọi"', async () => {
    await sendV1ToLabs()
    const r = await queue.takePatient('v1', DOC_A)
    expect(r.ok).toBe(true)
    expect(api.startExam).toHaveBeenCalledTimes(1)
    expect(visit('v1')).toMatchObject({ labOut: false, resumedFromLabs: true, entered: true })
  })

  it('"Khám tiếp" sau khi mở lại app vẫn chạy', async () => {
    await sendV1ToLabs()
    await load()
    expect((await queue.takePatient('v1', DOC_A)).ok).toBe(true)
    expect(queue.inRoom(visit('v1'))).toBe(true)
  })

  it('đã trả về hàng chờ (máy khác) → bỏ cờ cũ, bệnh nhân không kẹt ở nhóm "đi xét nghiệm"', async () => {
    await sendV1ToLabs()
    Object.assign(server[0], { status: 'CheckedIn', doctor: '', doctorId: null })
    await queue.syncQueue()
    expect(visit('v1')).toMatchObject({ status: 'CheckedIn', labOut: false })
  })

  it('bác sĩ khác đã nhận lượt này → cờ xét nghiệm cũ của máy này bị bỏ', async () => {
    await sendV1ToLabs()
    Object.assign(server[0], { status: 'Examining', doctor: DOC_B.name, doctorId: DOC_B.id })
    await queue.syncQueue()
    expect(queue.atLabs(visit('v1'))).toBe(false)
  })

  it('cờ xét nghiệm lưu theo ngày: sang ngày mới thì không đọc lại', async () => {
    await sendV1ToLabs()
    const saved = JSON.parse(localStorage.getItem('medassist_lab_local_v1'))
    expect(saved.byId.v1).toMatchObject({ labOut: true, doctorId: DOC_A.id })
    localStorage.setItem('medassist_lab_local_v1', JSON.stringify({ ...saved, day: '2000-01-01' }))
    await load()
    expect(queue.atLabs(visit('v1'))).toBe(false)
  })

  it('bác sĩ đóng lượt "không quay lại": gọi API huỷ với lý do tiếng Việt', async () => {
    await sendV1ToLabs()
    const r = await queue.leaveVisit('v1', { reason: 'no_return', note: 'gọi 2 lần' }, DOC_A)
    expect(r.ok).toBe(true)
    expect(api.cancelVisit).toHaveBeenCalledWith('v1', expect.stringContaining('gọi 2 lần'))
    expect(api.cancelVisit.mock.calls[0][1]).not.toMatch(/Did not come back/)
  })

  it('đang đi xét nghiệm vẫn mời được bệnh nhân khác (gọi start-exam cho người mới)', async () => {
    await sendV1ToLabs()
    expect((await queue.takePatient('v2', DOC_A)).ok).toBe(true)
    expect(api.startExam).toHaveBeenLastCalledWith('v2')
  })
})
