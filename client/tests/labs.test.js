import { describe, it, expect, beforeEach } from 'vitest'
import { fresh, admitReady, visitOf, DOC_A, DOC_B, DESK } from './helpers'

let s
beforeEach(async () => {
  s = await fresh()
})

const CBC = { code: 'XN01', name: 'Công thức máu', group: 'hematology', sample: 'blood' }
const CRP = { code: 'XN10', name: 'CRP', group: 'immunology', sample: 'blood' }

// Bệnh nhân đã vào phòng của bác sĩ (đang khám).
function inRoom(index = 0, doctor = DOC_A) {
  const v = admitReady(s, index)
  s.queue.takePatient(v.id, doctor)
  s.queue.confirmEntered(v.id)
  return v
}

describe('Chỉ định xét nghiệm', () => {
  it('chỉ bệnh nhân đang ở trong phòng mới chỉ định được', () => {
    const v = admitReady(s, 0)
    expect(s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A).ok).toBe(false)
  })

  it('phải chọn ít nhất một xét nghiệm (hoặc ghi xét nghiệm ngoài danh mục)', () => {
    const v = inRoom()
    expect(s.queue.sendToLabs(v.id, { tests: [], other: '  ' }, DOC_A).ok).toBe(false)
    expect(s.queue.sendToLabs(v.id, { tests: [], other: 'Siêu âm bụng' }, DOC_A).ok).toBe(true)
  })

  it('đi xét nghiệm: vẫn Đang khám nhưng ra khỏi phòng, giữ phiếu chỉ định', () => {
    const v = inRoom()
    const r = s.queue.sendToLabs(v.id, { tests: [CBC, CRP], diagnosis: ' Viêm phế quản? ' }, DOC_A)
    const x = visitOf(s, v.id)
    expect(x.status).toBe('Examining')
    expect(s.queue.atLabs(x)).toBe(true)
    expect(s.queue.inRoom(x)).toBe(false)
    expect(x.labOrders).toHaveLength(1)
    expect(r.order.diagnosis).toBe('Viêm phế quản?')
    expect(s.queue.labOrderSummary(r.order)).toBe('Công thức máu, CRP')
  })

  it('bệnh nhân đi xét nghiệm thì phòng trống: bác sĩ mời được người tiếp theo', () => {
    const a = inRoom(0)
    const b = admitReady(s, 1)
    s.queue.sendToLabs(a.id, { tests: [CBC] }, DOC_A)
    expect(s.queue.inRoomOf(DOC_A)).toHaveLength(0)
    expect(s.queue.takePatient(b.id, DOC_A).ok).toBe(true)
  })

  it('lễ tân báo "đã có kết quả" chỉ với người đang đi xét nghiệm', () => {
    const v = inRoom()
    expect(s.queue.markLabReturned(v.id).ok).toBe(false)
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    expect(s.queue.markLabReturned(v.id).ok).toBe(true)
    expect(visitOf(s, v.id).labReturnedAt).toBeTruthy()
  })
})

describe('Quay lại khám tiếp sau xét nghiệm', () => {
  it('"Khám tiếp": về lại phòng của bác sĩ, không phải check-in lại', () => {
    const v = inRoom()
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    const r = s.queue.takePatient(v.id, DOC_A)
    expect(r.ok).toBe(true)
    const x = visitOf(s, v.id)
    expect(x).toMatchObject({ status: 'Examining', labOut: false, resumedFromLabs: true, doctorId: DOC_A.id })
    expect(x.labOrders).toHaveLength(1)
  })

  it('giờ bắt đầu khám giữ nguyên lần đầu (không bị tính lại)', () => {
    const v = inRoom()
    const started = visitOf(s, v.id).examStartedAt
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    s.queue.takePatient(v.id, DOC_A)
    expect(visitOf(s, v.id).examStartedAt).toBe(started)
  })

  it('bác sĩ khác không nhận được bệnh nhân đang đi xét nghiệm của mình', () => {
    const v = inRoom()
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    const r = s.queue.takePatient(v.id, DOC_B)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/lab tests under another doctor/)
  })

  it('đang khám người khác thì phải xong người đó rồi mới khám tiếp', () => {
    const a = inRoom(0)
    s.queue.sendToLabs(a.id, { tests: [CBC] }, DOC_A)
    const b = admitReady(s, 1)
    s.queue.takePatient(b.id, DOC_A)
    const r = s.queue.takePatient(a.id, DOC_A)
    expect(r.ok).toBe(false)
    expect(r.busy.id).toBe(b.id)
    expect(s.queue.atLabs(visitOf(s, a.id))).toBe(true)
  })

  it('gọi khám tiếp mà chưa thấy vào: quay lại nhóm "đi xét nghiệm", không mất lượt', () => {
    const v = inRoom()
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    s.queue.takePatient(v.id, DOC_A)
    expect(s.queue.markNotPresent(v.id, DOC_A).ok).toBe(true)
    const x = visitOf(s, v.id)
    expect(x).toMatchObject({ status: 'Examining', labOut: true, doctorId: DOC_A.id })
    expect(s.queue.takePatient(v.id, DOC_A).ok).toBe(true)
  })

  it('chỉ định xét nghiệm nhiều lần trong một lượt khám', () => {
    const v = inRoom()
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    s.queue.takePatient(v.id, DOC_A)
    s.queue.confirmEntered(v.id)
    s.queue.sendToLabs(v.id, { tests: [CRP] }, DOC_A)
    expect(visitOf(s, v.id).labOrders.map((o) => o.tests[0].code)).toEqual(['XN01', 'XN10'])
  })

  it('không quay lại sau xét nghiệm: bác sĩ đóng lượt với lý do "không quay lại"', () => {
    const v = inRoom()
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    expect(s.queue.leaveVisit(v.id, { reason: 'no_return' }, DOC_A).ok).toBe(true)
    expect(visitOf(s, v.id)).toMatchObject({ status: 'Cancelled', labOut: false, left: { reason: 'no_return' } })
  })

  it('trả bệnh nhân đang đi xét nghiệm về hàng chờ: bỏ cờ xét nghiệm, bác sĩ khác nhận được', () => {
    const v = inRoom()
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    s.queue.releaseVisit(v.id, {}, DOC_A)
    expect(visitOf(s, v.id)).toMatchObject({ status: 'CheckedIn', labOut: false })
    expect(s.queue.takePatient(v.id, DOC_B).ok).toBe(true)
  })

  it('quầy không huỷ được lượt đang đi xét nghiệm', () => {
    const v = inRoom()
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    expect(s.queue.cancelVisit(v.id, { reason: 'left_waiting' }, DESK).ok).toBe(false)
  })
})

describe('Ghi kết quả xét nghiệm khi chốt đơn', () => {
  it('kết quả ghi đúng dòng của đúng phiếu, kể cả xét nghiệm ngoài danh mục', () => {
    const v = inRoom()
    const { order } = s.queue.sendToLabs(v.id, { tests: [CBC, CRP], other: 'Siêu âm bụng' }, DOC_A)
    s.queue.takePatient(v.id, DOC_A)
    const r = s.queue.finalizeVisit(
      v.id,
      { rx: [], diagnosis: 'J20.9', labResult: 'Viêm phế quản cấp', labResults: { [order.id + ':XN01']: ' 12.5 G/L ', [order.id + ':other']: 'Bình thường' } },
      DOC_A
    )
    expect(r.ok).toBe(true)
    const saved = visitOf(s, v.id).labOrders[0]
    expect(saved.tests.map((x) => x.result)).toEqual(['12.5 G/L', ''])
    expect(saved.otherResult).toBe('Bình thường')
    expect(s.queue.labRows(saved).map((x) => x.result)).toEqual(['12.5 G/L', '', 'Bình thường'])
    expect(visitOf(s, v.id).labResult).toBe('Viêm phế quản cấp')
  })

  it('chốt đơn khi bệnh nhân vừa về từ xét nghiệm: sang Chờ thanh toán, hết cờ xét nghiệm', () => {
    const v = inRoom()
    s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    s.queue.takePatient(v.id, DOC_A)
    s.queue.finalizeVisit(v.id, { rx: [], diagnosis: 'J20.9' }, DOC_A)
    const x = visitOf(s, v.id)
    expect(x.status).toBe('Prescribed')
    expect(x.labOut).toBe(false)
    expect(s.queue.atLabs(x)).toBe(false)
  })

  it('có nhập kết quả thì ghi nhật ký "lab.result"; không nhập thì không', () => {
    const v = inRoom()
    const { order } = s.queue.sendToLabs(v.id, { tests: [CBC] }, DOC_A)
    s.queue.takePatient(v.id, DOC_A)
    s.queue.finalizeVisit(v.id, { rx: [], diagnosis: 'x', labResults: { [order.id + ':XN01']: '9' } }, DOC_A)
    expect(s.activity.getActivity().some((e) => e.action === 'lab.result')).toBe(true)
  })
})
