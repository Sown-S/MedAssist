import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DOC_A, DOC_B, DESK } from './helpers'
import { VI } from '../src/renderer/src/i18n/vi.js'

// Quầy và phòng khám khi nối server (VITE_USE_MOCK=false), với “server” là vài mảng trong bộ nhớ làm đúng luật backend.
// Kiểm tra: gọi đúng API, chặn sớm khi thiếu dữ liệu, gửi lý do tiếng Việt và báo đúng câu lỗi của server.
let server
let stale
let api
let exam
let queue

async function load() {
  vi.resetModules()
  vi.doMock('../src/renderer/src/api/clinicApi.js', () => api)
  vi.doMock('../src/renderer/src/api/examApi.js', () => exam)
  queue = await import('../src/renderer/src/api/queueStore.js')
  await queue.syncQueue()
  await queue.syncStale()
}

const reject = (message) => Promise.reject(Object.assign(new Error(message), { status: 409 }))

beforeEach(async () => {
  localStorage.clear()
  vi.stubEnv('VITE_USE_MOCK', 'false')
  server = [
    { id: 'w1', ticket: 1, name: 'Bệnh nhân chờ', status: 'Waiting', doctor: '', doctorId: null, room: '' },
    { id: 'e1', ticket: 2, name: 'Bệnh nhân đang khám', status: 'Examining', doctor: DOC_A.name, doctorId: DOC_A.id, room: DOC_A.room },
    { id: 'p1', ticket: 3, name: 'Bệnh nhân chờ thanh toán', status: 'Prescribed', doctor: DOC_B.name, doctorId: DOC_B.id, room: DOC_B.room }
  ]
  stale = [{ id: 's1', ticket: 9, name: 'Lượt hôm qua', status: 'CheckedIn', carriedFrom: '2026-10-31' }]
  const find = (id) => server.find((v) => v.id === id)
  api = {
    fetchQueue: vi.fn(async () => server.map((v) => ({ ...v }))),
    fetchStale: vi.fn(async () => stale.map((v) => ({ ...v }))),
    cancelStale: vi.fn(async (ids) => (stale = stale.filter((v) => !ids.includes(v.id)))),
    checkIn: vi.fn(async (id) => {
      if (find(id).status !== 'Waiting') return reject('Lượt khám không còn ở trạng thái chờ')
      find(id).status = 'CheckedIn'
    }),
    cancelVisit: vi.fn(async (id) => (find(id).status = 'Cancelled')),
    releaseVisit: vi.fn(async (id) => {
      if (id === 'e1' && find(id).hasDiagnosis) return reject('Đã có chẩn đoán, không trả về hàng chờ được')
      Object.assign(find(id), { status: 'CheckedIn', doctor: '', doctorId: null, room: '' })
    }),
    startExam: vi.fn(async () => {}),
    labOut: vi.fn(async () => {}),
    labReturn: vi.fn(async () => {})
  }
  exam = { reopenPrescription: vi.fn(async (id) => Object.assign(find(id), { status: 'Examining' })) }
  await load()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('../src/renderer/src/api/clinicApi.js')
  vi.doUnmock('../src/renderer/src/api/examApi.js')
})

const visit = (id) => queue.getQueue().visits.find((v) => v.id === id)
const vi_ = (label) => {
  expect(VI[label], `thiếu bản dịch "${label}"`).toBeTruthy()
  return VI[label]
}

describe('Check-in ở quầy (server thật)', () => {
  it('gọi PATCH check-in rồi đồng bộ lại hàng chờ', async () => {
    expect(await queue.checkInVisit('w1', DESK)).toEqual({ ok: true })
    expect(api.checkIn).toHaveBeenCalledWith('w1')
    expect(visit('w1').status).toBe('CheckedIn')
  })

  it('server từ chối → trả đúng câu lỗi của server, không đổi trạng thái', async () => {
    const r = await queue.checkInVisit('e1', DESK)
    expect(r).toEqual({ ok: false, error: 'Lượt khám không còn ở trạng thái chờ' })
    expect(visit('e1').status).toBe('Examining')
  })
})

describe('Huỷ lượt đang chờ (server thật)', () => {
  it('chưa chọn lý do / "Khác" chưa ghi rõ → chặn ngay, không gửi request', async () => {
    expect((await queue.cancelVisit('w1', { reason: '' }, DESK)).ok).toBe(false)
    expect((await queue.cancelVisit('w1', { reason: 'other', note: '  ' }, DESK)).error).toBe('Describe what happened.')
    expect(api.cancelVisit).not.toHaveBeenCalled()
  })

  it('gửi lý do bằng tiếng Việt kèm ghi chú', async () => {
    expect((await queue.cancelVisit('w1', { reason: 'left_waiting', note: 'gọi 3 lần' }, DESK)).ok).toBe(true)
    expect(api.cancelVisit).toHaveBeenCalledWith('w1', `${vi_('Left before being called')} — gọi 3 lần`)
    expect(visit('w1').status).toBe('Cancelled')
  })
})

describe('Trả bệnh nhân về hàng chờ (server thật)', () => {
  it('chỉ bác sĩ đang khám người đó mới trả được — bác sĩ khác bị chặn, không gửi request', async () => {
    expect(queue.releaseVisit('e1', {}, DOC_B).ok).toBe(false)
    expect(api.releaseVisit).not.toHaveBeenCalled()
  })

  it('bác sĩ của lượt → PATCH release, lượt về CheckedIn và bỏ tên bác sĩ', async () => {
    expect(await queue.releaseVisit('e1', {}, DOC_A)).toEqual({ ok: true })
    expect(visit('e1')).toMatchObject({ status: 'CheckedIn', doctorId: null })
  })

  it('server từ chối (đã có chẩn đoán) → báo đúng câu của server', async () => {
    server[1].hasDiagnosis = true
    expect(await queue.releaseVisit('e1', {}, DOC_A)).toEqual({ ok: false, error: 'Đã có chẩn đoán, không trả về hàng chờ được' })
  })
})

describe('Thu hồi đơn chờ thanh toán (server thật)', () => {
  it('bác sĩ kê đơn, phòng đang trống → reopen kèm lý do tiếng Việt, lượt về Đang khám', async () => {
    expect(await queue.recallVisit('p1', DOC_B)).toEqual({ ok: true })
    expect(exam.reopenPrescription).toHaveBeenCalledWith('p1', expect.stringMatching(/thu hồi/))
    expect(visit('p1').status).toBe('Examining')
  })

  it('bác sĩ khác không thu hồi được', async () => {
    expect((await queue.recallVisit('p1', DOC_A)).ok).toBe(false)
    expect(exam.reopenPrescription).not.toHaveBeenCalled()
  })

  it('bác sĩ còn bệnh nhân trong phòng → phải xong người đó trước', async () => {
    server[1] = { ...server[1], doctor: DOC_B.name, doctorId: DOC_B.id, room: DOC_B.room }
    await queue.syncQueue()
    const r = await queue.recallVisit('p1', DOC_B)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Finish the patient in your room first/)
    expect(exam.reopenPrescription).not.toHaveBeenCalled()
  })
})

describe('Đóng lượt còn mở từ ngày trước (server thật)', () => {
  it('nạp danh sách từ GET /visits/stale', () => {
    expect(queue.getQueue().stale.map((v) => v.id)).toEqual(['s1'])
  })

  it('"Khác" chưa ghi rõ → chặn, không gửi request', async () => {
    expect((await queue.closeStaleVisit('s1', { reason: 'other' }, DESK)).ok).toBe(false)
    expect(api.cancelStale).not.toHaveBeenCalled()
  })

  it('gửi POST stale/cancel với lý do tiếng Việt, rồi tải lại danh sách', async () => {
    expect(await queue.closeStaleVisit('s1', { reason: 'left_waiting', note: 'không liên lạc được' }, DESK)).toEqual({ ok: true })
    expect(api.cancelStale).toHaveBeenCalledWith(['s1'], `${vi_('Left and did not come back')} — không liên lạc được`)
    expect(queue.getQueue().stale).toEqual([])
  })
})

describe('Mọi lý do huỷ / bỏ về đều có bản dịch (server lưu nguyên văn vào nhật ký)', () => {
  it.each(['LEFT_REASONS', 'CANCEL_REASONS', 'STALE_REASONS'])('%s', (name) => {
    for (const r of queue[name]) vi_(r.label)
  })
})
