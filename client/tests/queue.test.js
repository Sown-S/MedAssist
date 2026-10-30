import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fresh, admit, admitReady, visitOf, emptyQueue, tick, DOC_A, DOC_B, DESK } from './helpers'

let s
beforeEach(async () => {
  s = await fresh()
})

describe('Tiếp đón & số thứ tự', () => {
  it('lượt mới ở trạng thái Chờ khám, số thứ tự hệ thống cấp tăng dần', () => {
    const n = s.queue.nextTicket()
    const v = admit(s, 0)
    expect(v.status).toBe('Waiting')
    expect(v.ticket).toBe(n)
    expect(admit(s, 1).ticket).toBe(n + 1)
  })

  it('nhập tay số đã dùng hôm nay bị từ chối', () => {
    const v = admit(s, 0)
    const r = s.queue.createVisit(s.patients.getPatients()[1], { reason: 'x', ticket: v.ticket }, DESK)
    expect(r.ok).toBe(false)
  })

  it('số thứ tự không hợp lệ (0, âm, lẻ) bị từ chối', () => {
    const p = s.patients.getPatients()[1]
    for (const ticket of ['0', '-3', '2.5', 'abc']) expect(s.queue.createVisit(p, { reason: 'x', ticket }, DESK).ok).toBe(false)
  })

  it('lý do khám bỏ trống hiện "—", số BHYT viết hoa', () => {
    const v = admit(s, 0, { reason: '   ', insuranceNo: ' dn4790123 ' })
    expect(v.reason).toBe('—')
    expect(v.insuranceNo).toBe('DN4790123')
  })

  it('bệnh nhân đang có lượt chưa xong thì tìm ra được (không cấp số hai lần)', () => {
    const v = admit(s, 0)
    expect(s.queue.activeVisitOf(v.patientId).id).toBe(v.id)
  })

  it('check-in chỉ áp dụng cho lượt đang Chờ khám', () => {
    const v = admit(s, 0)
    expect(s.queue.checkInVisit(v.id, DESK).ok).toBe(true)
    expect(visitOf(s, v.id).status).toBe('CheckedIn')
    expect(s.queue.checkInVisit(v.id, DESK).ok).toBe(false)
  })
})

describe('Bác sĩ nhận bệnh nhân', () => {
  it('chưa check-in thì bác sĩ chưa nhận được', () => {
    const v = admit(s, 0)
    const r = s.queue.takePatient(v.id, DOC_A)
    expect(r.ok).toBe(false)
    expect(visitOf(s, v.id).status).toBe('Waiting')
  })

  it('nhận người đã check-in: sang Đang khám, gắn bác sĩ và phòng cố định, phát lệnh gọi', () => {
    const v = admitReady(s, 0)
    const r = s.queue.takePatient(v.id, DOC_A)
    expect(r.ok).toBe(true)
    const x = visitOf(s, v.id)
    expect(x.status).toBe('Examining')
    expect(x.doctorId).toBe(DOC_A.id)
    expect(x.room).toBe('Phòng khám 01')
    expect(x.entered).toBe(false)
    expect(s.queue.getQueue().calling).toBe(v.id)
    expect(s.queue.getQueue().calls[0]).toMatchObject({ visitId: v.id, room: 'Phòng khám 01', kind: 'call' })
  })

  it('bác sĩ khác không nhận trùng bệnh nhân đang khám', () => {
    const v = admitReady(s, 0)
    s.queue.takePatient(v.id, DOC_A)
    const r = s.queue.takePatient(v.id, DOC_B)
    expect(r.ok).toBe(false)
    expect(visitOf(s, v.id).doctorId).toBe(DOC_A.id)
  })

  it('đang có người trong phòng thì không mời thêm người khác', () => {
    const a = admitReady(s, 0)
    const b = admitReady(s, 1)
    s.queue.takePatient(a.id, DOC_A)
    const r = s.queue.takePatient(b.id, DOC_A)
    expect(r.ok).toBe(false)
    expect(r.busy.id).toBe(a.id)
    expect(visitOf(s, b.id).status).toBe('CheckedIn')
  })

  it('ca ưu tiên: bác sĩ xác nhận (force) thì mời được, có ghi nhật ký', () => {
    const a = admitReady(s, 0)
    const b = admitReady(s, 1, { priority: true })
    s.queue.takePatient(a.id, DOC_A)
    expect(s.queue.takePatient(b.id, DOC_A, { force: true }).ok).toBe(true)
    expect(s.activity.getActivity()[0].action).toBe('queue.take_override')
  })

  it('force không có tác dụng với ca thường', () => {
    const a = admitReady(s, 0)
    const b = admitReady(s, 1)
    s.queue.takePatient(a.id, DOC_A)
    expect(s.queue.takePatient(b.id, DOC_A, { force: true }).ok).toBe(false)
  })

  it('mời người tiếp theo: Cấp cứu → Ưu tiên → theo số; người vắng mặt xuống cuối', () => {
    emptyQueue(s)
    const thuong = admitReady(s, 0)
    const vang = admitReady(s, 1)
    const uuTien = admitReady(s, 2, { priority: true })
    const capCuu = admitReady(s, 3, { triage: 'emergency' })
    s.queue.takePatient(vang.id, DOC_B)
    s.queue.markNotPresent(vang.id, DOC_B)
    expect(s.queue.readyOrder().map((v) => v.id)).toEqual([capCuu.id, uuTien.id, thuong.id, vang.id])
    expect(s.queue.takeNext(DOC_A).visit.id).toBe(capCuu.id)
  })

  it('không còn ai check-in thì báo rõ lý do', () => {
    emptyQueue(s)
    expect(s.queue.takeNext(DOC_A).ok).toBe(false)
    admit(s, 0)
    expect(s.queue.takeNext(DOC_A).error).toMatch(/checked in/)
  })
})

describe('Gọi bệnh nhân vào phòng', () => {
  it('bệnh nhân vào phòng → hết trạng thái "đang mời"', () => {
    const v = admitReady(s, 0)
    s.queue.takePatient(v.id, DOC_A)
    s.queue.confirmEntered(v.id)
    expect(visitOf(s, v.id).entered).toBe(true)
    expect(s.queue.getQueue().calling).toBeNull()
  })

  it('gọi lại chỉ khi bệnh nhân còn đang được mời', () => {
    const v = admitReady(s, 0)
    s.queue.takePatient(v.id, DOC_A)
    expect(s.queue.recallPatient(v.id, DESK).ok).toBe(true)
    expect(s.queue.getQueue().calls[0].kind).toBe('recall')
    s.queue.confirmEntered(v.id)
    expect(s.queue.recallPatient(v.id, DESK).ok).toBe(false)
  })

  it('không có mặt: trả về nhóm đã check-in, giữ số, bỏ bác sĩ và phòng', () => {
    const v = admitReady(s, 0)
    s.queue.takePatient(v.id, DOC_A)
    expect(s.queue.markNotPresent(v.id, DESK).ok).toBe(true)
    expect(visitOf(s, v.id)).toMatchObject({ status: 'CheckedIn', absent: true, doctor: '', doctorId: null, room: '', ticket: v.ticket })
  })

  it('bác sĩ khác (không phải người mời) không báo vắng được', () => {
    const v = admitReady(s, 0)
    s.queue.takePatient(v.id, DOC_A)
    expect(s.queue.markNotPresent(v.id, DOC_B).ok).toBe(false)
  })
})

describe('Trả về hàng chờ & huỷ lượt', () => {
  it('trả về hàng chờ: bác sĩ khác nhận lại được, phiếu dở đi kèm', () => {
    const v = admitReady(s, 0)
    s.queue.takePatient(v.id, DOC_A)
    expect(s.queue.releaseVisit(v.id, { draft: { hpi: 'ho 3 ngày' } }, DOC_A).ok).toBe(true)
    expect(visitOf(s, v.id)).toMatchObject({ status: 'CheckedIn', doctorId: null })
    expect(visitOf(s, v.id).released.draft.hpi).toBe('ho 3 ngày')
    expect(s.queue.takePatient(v.id, DOC_B).ok).toBe(true)
  })

  it('không trả về hàng chờ bệnh nhân của bác sĩ khác', () => {
    const v = admitReady(s, 0)
    s.queue.takePatient(v.id, DOC_A)
    expect(s.queue.releaseVisit(v.id, {}, DOC_B).ok).toBe(false)
  })

  it('quầy huỷ lượt đang chờ: bắt buộc lý do, "Khác" phải ghi chú', () => {
    const v = admit(s, 0)
    expect(s.queue.cancelVisit(v.id, { reason: '' }, DESK).ok).toBe(false)
    expect(s.queue.cancelVisit(v.id, { reason: 'other', note: '  ' }, DESK).ok).toBe(false)
    expect(s.queue.cancelVisit(v.id, { reason: 'left_waiting' }, DESK).ok).toBe(true)
    expect(visitOf(s, v.id).status).toBe('Cancelled')
    expect(s.queue.activeVisitOf(v.patientId)).toBeUndefined()
  })

  it('quầy không huỷ được lượt đang khám', () => {
    const v = admitReady(s, 0)
    s.queue.takePatient(v.id, DOC_A)
    expect(s.queue.cancelVisit(v.id, { reason: 'left_waiting' }, DESK).ok).toBe(false)
  })

  it('bác sĩ đóng lượt "bỏ về" chỉ với bệnh nhân của mình, có lý do', () => {
    const v = admitReady(s, 0)
    s.queue.takePatient(v.id, DOC_A)
    expect(s.queue.leaveVisit(v.id, { reason: 'left_exam' }, DOC_B).ok).toBe(false)
    expect(s.queue.leaveVisit(v.id, { reason: 'nope' }, DOC_A).ok).toBe(false)
    expect(s.queue.leaveVisit(v.id, { reason: 'left_exam', draft: { hpi: 'x' } }, DOC_A).ok).toBe(true)
    expect(visitOf(s, v.id)).toMatchObject({ status: 'Cancelled', draftNotes: { hpi: 'x' } })
  })

  it('sửa lượt đang chờ: mức phân loại chỉ được nâng, không hạ', () => {
    const v = admit(s, 0, { triage: 'high', priority: true })
    s.queue.updateWaitingVisit(v.id, { reason: 'x', triage: 'routine', priority: false }, DESK)
    expect(visitOf(s, v.id)).toMatchObject({ triage: 'high', priority: true })
    s.queue.updateWaitingVisit(v.id, { reason: 'x', triage: 'emergency' }, DESK)
    expect(visitOf(s, v.id).triage).toBe('emergency')
  })

  it('chỉ sửa được lượt còn Chờ khám (đã check-in thì thôi)', () => {
    const v = admitReady(s, 0)
    expect(s.queue.updateWaitingVisit(v.id, { reason: 'x' }, DESK).ok).toBe(false)
  })
})

describe('Ca cờ đỏ', () => {
  it('chuyển viện ngay: lượt đang chờ bị đóng với lý do chuyển tuyến', () => {
    const v = admit(s, 0)
    s.queue.recordRedFlag({ id: v.patientId, name: v.name, signs: 'Đau ngực', visitId: v.id }, DESK, 'referred')
    expect(visitOf(s, v.id)).toMatchObject({ status: 'Cancelled', left: { reason: 'referred_out' } })
  })

  it('cờ đỏ chờ bác sĩ: lên Cấp cứu, quầy không tự huỷ được lượt', () => {
    const v = admit(s, 0)
    s.queue.recordRedFlag({ id: v.patientId, name: v.name, signs: 'Khó thở', visitId: v.id }, DESK, 'queued')
    expect(visitOf(s, v.id)).toMatchObject({ priority: true, triage: 'emergency', status: 'Waiting' })
    expect(s.queue.cancelVisit(v.id, { reason: 'left_waiting' }, DESK).ok).toBe(false)
  })

  it('bác sĩ quyết chuyển tuyến → đóng lượt; quầy phải xem lại thông báo', () => {
    const v = admit(s, 0)
    const rf = s.queue.recordRedFlag({ id: v.patientId, name: v.name, signs: 'Khó thở', visitId: v.id }, DESK, 'queued')
    s.queue.acknowledgeRedFlag(rf.id)
    s.queue.reviewRedFlag(rf.id, 'referred', DOC_A)
    expect(visitOf(s, v.id).status).toBe('Cancelled')
    const saved = s.queue.getQueue().redFlags.find((r) => r.id === rf.id)
    expect(saved).toMatchObject({ outcome: 'referred', ack: false, doctorReview: { byId: DOC_A.id } })
  })
})

describe('Sang ngày mới', () => {
  it('lượt chưa đóng của hôm qua không mất: vào danh sách "lượt chưa đóng"', async () => {
    const v = admit(s, 0)
    // Giả lập dữ liệu đã lưu từ hôm qua rồi mở lại app.
    const saved = JSON.parse(localStorage.getItem('medassist_queue_v2'))
    localStorage.setItem('medassist_queue_v2', JSON.stringify({ ...saved, day: '2000-01-01' }))
    vi.resetModules()
    const queue = await import('../src/renderer/src/api/queueStore.js')
    const stale = queue.getQueue().stale.find((x) => x.id === v.id)
    expect(stale.carriedFrom).toBe('2000-01-01')
    expect(queue.staleVisitOf(v.patientId).id).toBe(v.id)
    expect(queue.getQueue().visits.some((x) => x.id === v.id)).toBe(false)
  })

  it('đóng lượt cũ phải có lý do; chỉ lượt chờ thanh toán mới thu tiếp được', async () => {
    const v = admit(s, 0)
    const saved = JSON.parse(localStorage.getItem('medassist_queue_v2'))
    localStorage.setItem('medassist_queue_v2', JSON.stringify({ ...saved, day: '2000-01-01' }))
    vi.resetModules()
    const queue = await import('../src/renderer/src/api/queueStore.js')
    expect(queue.reopenStaleForPayment(v.id, DESK).ok).toBe(false)
    expect(queue.closeStaleVisit(v.id, { reason: '' }, DESK).ok).toBe(false)
    expect(queue.closeStaleVisit(v.id, { reason: 'left_waiting' }, DESK).ok).toBe(true)
    expect(queue.staleVisitOf(v.patientId)).toBeUndefined()
  })

  it('số thứ tự hôm nay không tính lượt chuyển từ ngày trước', () => {
    tick()
    const n = s.queue.nextTicket()
    s.queue.getQueue().visits.push({ id: 'old', ticket: 999, carriedFrom: '2000-01-01', status: 'Prescribed' })
    expect(s.queue.nextTicket()).toBe(n)
    expect(s.queue.ticketTaken(999)).toBe(false)
  })
})
