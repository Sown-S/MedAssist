import { describe, it, expect, beforeEach } from 'vitest'
import { fresh, ADMIN } from './helpers'

let s
let vitals
let triage
let perms
beforeEach(async () => {
  s = await fresh()
  vitals = await import('../src/renderer/src/api/vitals.js')
  triage = (await import('../src/renderer/src/api/triage.js')).triage
  perms = await import('../src/renderer/src/api/permissionStore.js')
})

describe('Sinh hiệu lúc tiếp đón', () => {
  it('đọc số kiểu Việt Nam (dấu phẩy), bỏ đơn vị, ô trống thì không gửi', () => {
    expect(vitals.vitalsFromForm({ temperature_c: '38,56', weight_kg: '60 kg', heart_rate_bpm: '', spo2_pct: '97%' })).toEqual({ temperature_c: 38.6, weight_kg: 60, spo2_pct: 97 })
  })

  it('ngoài khoảng nhập (gõ nhầm) → lỗi; bất thường nhưng có thể đúng → chỉ cảnh báo', () => {
    const r = vitals.checkVitals({ temperature_c: '47', spo2_pct: '75' })
    expect(r.errors.map((e) => e.key)).toEqual(['temperature_c'])
    expect(r.warnings).toHaveLength(0)
    expect(vitals.checkVitals({ temperature_c: '42.5' }).warnings).toHaveLength(1)
  })

  it('mạch phải là số nguyên; chữ thì báo nhập số', () => {
    expect(vitals.checkVitals({ heart_rate_bpm: '80.5' }).errors).toHaveLength(1)
    expect(vitals.checkVitals({ heart_rate_bpm: 'tám mươi' }).errors[0].msg).toMatch(/enter a number/)
  })

  it('huyết áp: phải nhập đủ tâm thu + tâm trương, tâm trương thấp hơn tâm thu', () => {
    expect(vitals.checkVitals({ systolic_bp_mmhg: '120' }).errors).toHaveLength(1)
    expect(vitals.checkVitals({ systolic_bp_mmhg: '80', diastolic_bp_mmhg: '120' }).errors[0].key).toBe('diastolic_bp_mmhg')
    expect(vitals.checkVitals({ systolic_bp_mmhg: '120', diastolic_bp_mmhg: '80' }).errors).toEqual([])
  })

  it('dữ liệu cũ "80 · 120/80" đọc ra đúng 8 khoá chuẩn và hiển thị gọn', () => {
    const v = vitals.normalizeVitals({ pulseBp: '80 · 120/80', temp: '37.5°C' })
    expect(v).toEqual({ heart_rate_bpm: 80, systolic_bp_mmhg: 120, diastolic_bp_mmhg: 80, temperature_c: 37.5 })
    expect(vitals.vitalsText(v)).toBe('HR 80 · BP 120/80 · 37.5°C')
    expect(vitals.vitalsText(null)).toBe('—')
  })
})

describe('Phân loại cờ đỏ lúc tiếp đón (luật, không dùng AI)', () => {
  it('đau ngực + khó thở → Cấp cứu', () => {
    expect(triage({ states: { chest_pain: 'PRESENT', dyspnea: 'PRESENT' }, age: 55 }).level).toBe('emergency')
  })

  it('SpO2 dưới 92% → Cấp cứu dù không khai triệu chứng', () => {
    expect(triage({ vitals: { spo2_pct: 90 }, age: 30 }).level).toBe('emergency')
    expect(triage({ vitals: { spo2_pct: 97 }, age: 30 }).level).toBe('routine')
  })

  it('trẻ ≤ 15 tuổi sốt trên 39°C → Ưu tiên; người lớn sốt 39.5°C thì không', () => {
    expect(triage({ vitals: { temperature_c: 39.5 }, age: 6 }).level).toBe('high')
    expect(triage({ vitals: { temperature_c: 39.5 }, age: 30 }).level).not.toBe('high')
  })

  it('có đau ngực nhưng chưa hỏi khó thở → báo "cần hỏi ngay", không bỏ qua', () => {
    const r = triage({ states: { chest_pain: 'PRESENT' }, age: 55 })
    expect(r.level).toBe('routine')
    expect(r.needNow).toContain('sym:dyspnea')
  })

  it('đã hỏi và KHÔNG khó thở → không còn nhắc', () => {
    expect(triage({ states: { chest_pain: 'PRESENT', dyspnea: 'ABSENT' }, age: 55 }).needNow).not.toContain('sym:dyspnea')
  })
})

describe('Phân quyền theo vai trò', () => {
  it('Quản trị viên không khám, không kê đơn, không xem hồ sơ bệnh án', () => {
    for (const p of ['consultation.add', 'prescribing.add', 'rx.finalize', 'patient.clinical']) expect(perms.can('admin', p)).toBe(false)
    expect(perms.can('admin', 'staff.add')).toBe(true)
  })

  it('bác sĩ chốt đơn được nhưng không thu tiền, không quản lý nhân viên', () => {
    expect(perms.can('doctor', 'rx.finalize')).toBe(true)
    expect(perms.can('doctor', 'payments.add')).toBe(false)
    expect(perms.can('doctor', 'staff.view')).toBe(false)
  })

  it('lễ tân tiếp đón, thu tiền, huỷ hoá đơn; không kê đơn', () => {
    expect(perms.can('reception', 'registration.add')).toBe(true)
    expect(perms.can('reception', 'invoice.void')).toBe(true)
    expect(perms.can('reception', 'prescribing.add')).toBe(false)
    expect(perms.can('khach', 'registration.view')).toBe(false)
  })
})

describe('Đánh số chứng từ, làm tròn tiền, nhật ký, tiếng Việt', () => {
  it('số chứng từ theo mẫu tiền tố-ngày-số, bỏ qua số đã dùng', () => {
    const d = new Date(2026, 9, 30)
    expect(s.settings.formatNumber({ prefix: 'HD', date: 'yymmdd', digits: 4 }, 7, d)).toBe('HD-261030-0007')
    expect(s.settings.nextNumber('invoice', ['HD-261030-0001', 'HD-261030-0002'], d)).toBe('HD-261030-0003')
  })

  it('làm tròn số tiền thu đến 1.000đ', () => {
    expect(s.settings.roundMoney(105400)).toBe(105000)
    expect(s.settings.roundMoney(105500)).toBe(106000)
  })

  it('nhật ký hoạt động chỉ ghi thêm: sửa một dòng là bị phát hiện', () => {
    s.activity.logEvent(ADMIN, 'settings.update', { params: { field: 'x' } })
    expect(s.activity.verifyChain().ok).toBe(true)
    const tampered = s.activity.getActivity().map((e, i) => (i === 3 ? { ...e, actor: { ...e.actor, name: 'Người khác' } } : e))
    expect(s.activity.verifyChain(tampered)).toMatchObject({ ok: false, reason: 'modified' })
    expect(s.activity.verifyChain(s.activity.getActivity().filter((_, i) => i !== 3)).ok).toBe(false)
  })

  it('dịch giao diện sang tiếng Việt, giữ khoảng trắng; chuỗi không có bản dịch giữ nguyên', async () => {
    const i18n = await import('../src/renderer/src/i18n/index.js')
    i18n.setLang('vi')
    expect(i18n.translate('Choose from calendar')).toBe('Chọn trên lịch')
    expect(i18n.translate('  Choose from calendar ')).toBe('  Chọn trên lịch ')
    expect(i18n.translate('zzz không có')).toBe('zzz không có')
    i18n.setLang('en')
    expect(i18n.translate('Choose from calendar')).toBe('Choose from calendar')
  })
})
