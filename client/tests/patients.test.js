import { describe, it, expect, beforeEach } from 'vitest'
import { fresh, DESK, DOC_A } from './helpers'

let s
beforeEach(async () => {
  s = await fresh()
})

// Ngày sinh dd/mm/yyyy cách hôm nay n năm (± dayShift ngày).
const dobYearsAgo = (years, dayShift = 0) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setDate(d.getDate() + dayShift)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

describe('Ô ngày sinh (dd/mm/yyyy)', () => {
  it('gõ số liền nhau tự chèn dấu "/"', () => {
    expect(s.clinic.maskDob('1')).toBe('1')
    expect(s.clinic.maskDob('120')).toBe('12/0')
    expect(s.clinic.maskDob('12031975')).toBe('12/03/1975')
  })

  it('bỏ chữ, ký tự lạ và số thừa quá 8 chữ số', () => {
    expect(s.clinic.maskDob('12a03-1975')).toBe('12/03/1975')
    expect(s.clinic.maskDob('1203197599')).toBe('12/03/1975')
    expect(s.clinic.maskDob('')).toBe('')
  })

  it('đổi dd/mm/yyyy sang yyyy-mm-dd gửi server (thêm số 0 còn thiếu)', () => {
    expect(s.clinic.isoDob('12/03/1975')).toBe('1975-03-12')
    expect(s.clinic.isoDob('1/2/2000')).toBe('2000-02-01')
    expect(s.clinic.isoDob('12/03/75')).toBeNull()
    expect(s.clinic.isoDob('')).toBeNull()
  })

  it('chọn trên lịch (yyyy-mm-dd) hiện lại đúng dd/mm/yyyy', () => {
    expect(s.clinic.dmyDob('1975-03-12')).toBe('12/03/1975')
    expect(s.clinic.dmyDob('1975-03-12T00:00:00Z')).toBe('12/03/1975')
    expect(s.clinic.dmyDob(null)).toBe('')
  })

  it('đi vòng ô nhập → lịch → ô nhập không đổi ngày', () => {
    const typed = s.clinic.maskDob('05082022')
    expect(s.clinic.dmyDob(s.clinic.isoDob(typed))).toBe(typed)
  })

  it('tính tuổi đúng quanh ngày sinh nhật', () => {
    expect(s.patients.ageOf(dobYearsAgo(30))).toBe(30) // sinh nhật hôm nay
    expect(s.patients.ageOf(dobYearsAgo(30, 1))).toBe(29) // mai mới sinh nhật
    expect(s.patients.ageOf(dobYearsAgo(30, -1))).toBe(30)
  })

  it('ngày sinh trong tương lai hoặc quá 130 tuổi không hợp lệ', () => {
    expect(s.patients.ageOf(dobYearsAgo(-1))).toBe('')
    expect(s.patients.ageOf('01/01/1850')).toBe('')
    expect(s.patients.ageOf('12-03-1975')).toBe('')
  })

  it('ngày không có thật (31/02, 30/02, tháng 13) không hợp lệ', () => {
    expect(s.patients.ageOf('31/02/2000')).toBe('')
    expect(s.patients.ageOf('30/02/2001')).toBe('')
    expect(s.patients.ageOf('10/13/2000')).toBe('')
    expect(s.patients.ageOf('00/05/2000')).toBe('')
    expect(s.patients.ageOf('29/02/2000')).not.toBe('') // năm nhuận: có thật
  })
})

describe('Danh bạ bệnh nhân', () => {
  const NEW = { name: '  Nguyễn Văn Test ', phone: '0901 234 567', dob: '01/01/1990', gender: 'Male', allergies: '', history: '', idNumber: '0790 0000 1234' }

  it('đăng ký: cấp mã BN kế tiếp, chuẩn hoá họ tên / SĐT / CCCD', () => {
    const before = s.patients.getPatients().length
    const p = s.patients.registerPatient(NEW, DESK)
    expect(p.id).toBe('BN000117')
    expect(p.name).toBe('Nguyễn Văn Test')
    expect(p.phone).toBe('0901234567')
    expect(p.idNumber).toBe('079000001234')
    expect(s.patients.getPatients()).toHaveLength(before + 1)
  })

  it('phát hiện trùng theo SĐT', () => {
    const dup = s.patients.findDuplicates({ name: 'Người khác', phone: '0912 456 789', dob: '' })
    expect(dup.map((p) => p.name)).toContain('Phạm Thị Hoa')
  })

  it('phát hiện trùng theo họ tên + ngày sinh, gõ không dấu vẫn ra', () => {
    const dup = s.patients.findDuplicates({ name: 'pham thi hoa', phone: '', dob: '12/03/1975' })
    expect(dup).toHaveLength(1)
    expect(s.patients.findDuplicates({ name: 'pham thi hoa', phone: '', dob: '13/03/1975' })).toHaveLength(0)
  })

  it('tìm kiếm không dấu, theo SĐT và theo mã hồ sơ', () => {
    expect(s.patients.searchPatients('nguyen thi lan').map((p) => p.name)).toContain('Nguyễn Thị Lan')
    expect(s.patients.searchPatients('0967622356')[0].name).toBe('Nguyễn Thị Lan')
    expect(s.patients.searchPatients('BN000101')[0].name).toBe('Phạm Thị Hoa')
    expect(s.patients.searchPatients('   ')).toEqual([])
  })

  it('CCCD là duy nhất: không cho sửa hồ sơ sang CCCD của người khác', () => {
    const a = s.patients.registerPatient(NEW, DESK)
    const b = s.patients.getPatients()[0]
    const r = s.patients.updatePatientAdmin(b.id, { idNumber: '079000001234' }, DESK)
    expect(r.ok).toBe(false)
    expect(s.patients.idNumberOwner('079000001234', b.id).id).toBe(a.id)
    expect(s.patients.idNumberOwner('079000001234', a.id)).toBeNull()
  })

  it('sửa hành chính: không cho để trống họ tên, không đổi gì thì không ghi', () => {
    const p = s.patients.getPatients()[0]
    expect(s.patients.updatePatientAdmin(p.id, { name: '   ' }, DESK).ok).toBe(false)
    expect(s.patients.updatePatientAdmin(p.id, { name: p.name }, DESK)).toEqual({ ok: true, changed: false })
    expect(s.patients.updatePatientAdmin(p.id, { phone: '0999-888-777' }, DESK).changed).toBe(true)
    expect(s.patients.findPatient(p.id).phone).toBe('0999888777')
  })

  it('bác sĩ sửa dị ứng: lưu vào hồ sơ và ghi nhật ký mức cảnh báo', () => {
    const p = s.patients.getPatients()[0]
    const r = s.patients.updatePatientClinical(p.id, { allergies: ' Penicillin ', history: '' }, DOC_A)
    expect(r.changed).toBe(true)
    expect(s.patients.findPatient(p.id).allergies).toBe('Penicillin')
    const log = s.activity.getActivity()[0]
    expect(log.action).toBe('patient.clinical_update')
    expect(log.level).toBe('warning')
  })
})
