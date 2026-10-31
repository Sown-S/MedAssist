import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DOC_A, DOC_B } from './helpers'
import { groupProposals, applicable } from '../src/renderer/src/api/vitals'

// Mời vào phòng và ca cờ đỏ khi nối server (ERD v2.0). “Server” trong bộ nhớ làm đúng luật: mỗi bác sĩ một lời mời
// (409 ACTIVE_CALL), hết người → 409 QUEUE_EMPTY, không giành người bác sĩ khác đang mời (CALLED_BY_OTHER).
let server
let api
let queue
let current = DOC_A

const apiError = (code, message) => Object.assign(new Error(message), { code })

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
  const row = (id, ticket, status, extra = {}) => ({ id, ticket, name: 'Bệnh nhân ' + ticket, status, triage: 'routine', doctor: '', doctorId: null, room: '', labOut: false, calledAt: null, calledById: null, calledByName: '', calledRoom: '', ...extra })
  server = [row('v1', 1, 'CheckedIn'), row('v2', 2, 'Waiting'), row('v3', 3, 'Waiting', { triage: 'emergency', redFlagReason: 'Đau ngực dữ dội' })]
  const find = (id) => server.find((v) => v.id === id)
  const queued = (v) => ['Waiting', 'CheckedIn'].includes(v.status) && !v.doctorId
  const active = () => server.find((v) => queued(v) && v.calledById === current.id)
  let clock = 0
  const stamp = (v) => Object.assign(v, { calledAt: new Date(Date.UTC(2026, 9, 31, 8, 0, ++clock)).toISOString(), calledById: current.id, calledByName: current.name, calledRoom: current.room })
  api = {
    fetchQueue: vi.fn(async () => server.map((v) => ({ ...v }))),
    fetchStale: vi.fn(async () => []),
    startExam: vi.fn(async (id) => Object.assign(find(id), { status: 'Examining', doctor: current.name, doctorId: current.id, room: current.room })),
    callNext: vi.fn(async () => {
      if (active()) throw apiError('ACTIVE_CALL', 'Bạn đang mời một bệnh nhân chưa vào phòng')
      const order = { emergency: 0, priority: 1, routine: 2 }
      const v = server.filter((x) => queued(x) && !x.calledAt).sort((a, b) => order[a.triage] - order[b.triage] || a.ticket - b.ticket)[0]
      if (!v) throw apiError('QUEUE_EMPTY', 'Không còn bệnh nhân chờ khám')
      return { visit_id: stamp(v).id }
    }),
    callVisit: vi.fn(async (id) => {
      const v = find(id)
      if (v.calledById && v.calledById !== current.id) throw apiError('CALLED_BY_OTHER', 'Bác sĩ khác đang mời bệnh nhân này')
      return { visit_id: stamp(v).id }
    }),
    cancelCall: vi.fn(async (id) => {
      const v = find(id)
      if (!v.calledAt) throw apiError('NOT_CALLED', 'Lượt khám không ở trạng thái đang mời')
      Object.assign(v, { calledAt: null, calledById: null, calledByName: '', calledRoom: '' })
      return { visit_id: id }
    })
  }
  await load()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('../src/renderer/src/api/clinicApi.js')
})

const visit = (id) => queue.getQueue().visits.find((v) => v.id === id)

describe('Mời bệnh nhân vào phòng qua server', () => {
  it('"Mời tiếp" chỉ gửi lời mời (call-next), không nhận khám — cấp cứu được mời trước', async () => {
    const r = await queue.takeNext(DOC_A)
    expect(r.ok).toBe(true)
    expect(r.invited.id).toBe('v3')
    expect(api.callNext).toHaveBeenCalledTimes(1)
    expect(api.startExam).not.toHaveBeenCalled()
    expect(queue.isInvited(visit('v3'))).toBe(true)
    expect(queue.myInvite(DOC_A).id).toBe('v3')
    expect(queue.myInvite(DOC_B)).toBeNull()
  })

  it('đang mời người chưa vào → 409 ACTIVE_CALL thành câu báo dễ hiểu', async () => {
    await queue.takeNext(DOC_A)
    const r = await queue.takeNext(DOC_A)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('ACTIVE_CALL')
    expect(r.error).toMatch(/already calling/)
  })

  it('hết người chờ → 409 QUEUE_EMPTY', async () => {
    server.forEach((v) => (v.status = 'Finished'))
    await queue.syncQueue()
    const r = await queue.takeNext(DOC_A)
    expect(r).toMatchObject({ ok: false, code: 'QUEUE_EMPTY', error: 'No one is waiting.' })
  })

  it('còn bệnh nhân trong phòng → chưa mời người khác (hỏi lại như bản demo)', async () => {
    expect((await queue.takePatient('v1', DOC_A)).ok).toBe(true)
    const r = await queue.takeNext(DOC_A)
    expect(r.ok).toBe(false)
    expect(r.busy.id).toBe('v1')
    expect(api.callNext).not.toHaveBeenCalled()
  })

  it('không có mặt → bỏ lời mời, bệnh nhân giữ nguyên chỗ trong hàng chờ', async () => {
    await queue.takeNext(DOC_A)
    const r = await queue.dropInvite('v3', DOC_A)
    expect(r.ok).toBe(true)
    expect(visit('v3').status).toBe('Waiting')
    expect(queue.isInvited(visit('v3'))).toBe(false)
    expect(queue.myInvite(DOC_A)).toBeNull()
  })

  it('gọi lại đổi called_at (máy quầy báo chuông lại); không giành người bác sĩ khác đang mời', async () => {
    await queue.takeNext(DOC_A)
    const first = visit('v3').calledAt
    expect((await queue.inviteAgain('v3')).ok).toBe(true)
    expect(visit('v3').calledAt).not.toBe(first)
    current = DOC_B
    const r = await queue.inviteAgain('v3')
    expect(r).toMatchObject({ ok: false, code: 'CALLED_BY_OTHER' })
  })

  it('máy quầy thấy danh sách lời mời kèm bác sĩ, phòng; nhận khám xong thì hết "đang mời"', async () => {
    await queue.takeNext(DOC_A)
    const [inv] = queue.invitesOf()
    expect(inv).toMatchObject({ id: 'v3', calledByName: DOC_A.name, calledRoom: DOC_A.room })
    server[2].status = 'CheckedIn'
    await queue.syncQueue()
    expect((await queue.takePatient('v3', DOC_A)).ok).toBe(true)
    expect(queue.invitesOf()).toHaveLength(0)
  })
})

describe('Ca cờ đỏ khi chạy với server thật', () => {
  it('lấy từ lượt Cấp cứu đang chờ ở server, không lưu ở máy', async () => {
    const rf = queue.getQueue().redFlags
    expect(rf).toHaveLength(1)
    expect(rf[0]).toMatchObject({ visitId: 'v3', outcome: 'queued', signs: 'Đau ngực dữ dội' })
    expect(Object.keys(localStorage).filter((k) => k.includes('queue'))).toEqual([])
  })

  it('bác sĩ "Bỏ qua" vẫn giữ sau khi đồng bộ; lượt rời hàng chờ thì hết cảnh báo', async () => {
    const [rf] = queue.getQueue().redFlags
    queue.reviewRedFlag(rf.id, 'seen', DOC_A)
    await queue.syncQueue()
    expect(queue.getQueue().redFlags[0].doctorReview.by).toBe(DOC_A.name)
    expect(visit('v3').status).toBe('Waiting') // không tự đóng lượt ở máy
    server[2].status = 'Finished'
    await queue.syncQueue()
    expect(queue.getQueue().redFlags).toHaveLength(0)
  })
})

describe('Đề xuất sinh hiệu từ lời kể', () => {
  const list = [
    { key: 'heart_rate_bpm', value: 132, evidence: 'mạch 132', group: null },
    { key: 'systolic_bp_mmhg', value: 140, evidence: 'HA 140/90', group: 'blood_pressure' },
    { key: 'diastolic_bp_mmhg', value: 90, evidence: 'HA 140/90', group: 'blood_pressure' }
  ]

  it('"Sốt, quấy khóc, mạch 132" → đề xuất nhịp tim 132, điền khi ô còn trống', () => {
    const [hr] = groupProposals(list.slice(0, 1))
    expect(applicable(hr, { heart_rate_bpm: '' })).toEqual({ heart_rate_bpm: '132' })
  })

  it('không bao giờ ghi đè số đã nhập', () => {
    const [hr] = groupProposals(list.slice(0, 1))
    expect(applicable(hr, { heart_rate_bpm: '110' })).toEqual({})
  })

  it('huyết áp đi theo cặp: một mục, chỉ điền khi cả hai ô trống', () => {
    const items = groupProposals(list)
    const bp = items.find((i) => i.bp)
    expect(items).toHaveLength(2)
    expect(applicable(bp, {})).toEqual({ systolic_bp_mmhg: '140', diastolic_bp_mmhg: '90' })
    expect(applicable(bp, { systolic_bp_mmhg: '130' })).toEqual({})
  })
})
