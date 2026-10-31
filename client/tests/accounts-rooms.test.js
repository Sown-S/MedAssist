import { describe, it, expect, beforeEach } from 'vitest'
import { fresh, ADMIN } from './helpers'

let s
beforeEach(async () => {
  s = await fresh()
})

const doctor = (username, roomId, extra = {}) => s.accounts.createAccount({ username, fullName: 'BS ' + username, roleKey: 'doctor', roomId, ...extra }, ADMIN)
// Mật khẩu mặc định của admin đầu tiên (bản demo).
const ADMIN_PW = 'Admin@123'

describe('Tạo & sửa tài khoản nhân viên', () => {
  it('tạo tài khoản: cấp mã NV, mật khẩu tạm, bắt đổi mật khẩu lần đầu', async () => {
    const r = await s.accounts.createAccount({ username: 'letan1', fullName: 'Nguyễn Thị Mai', roleKey: 'reception' }, ADMIN)
    expect(r.ok).toBe(true)
    expect(r.account).toMatchObject({ staffCode: 'NV002', mustChange: true, roleKey: 'reception' })
    expect(r.password.length).toBeGreaterThanOrEqual(10)
    expect(r.account.hash).toBeUndefined() // không lộ mật khẩu băm ra giao diện
  })

  it('thiếu họ tên / tên đăng nhập, vai trò lạ → từ chối', async () => {
    expect((await s.accounts.createAccount({ username: '', fullName: 'A', roleKey: 'doctor' }, ADMIN)).ok).toBe(false)
    expect((await s.accounts.createAccount({ username: 'a', fullName: ' ', roleKey: 'doctor' }, ADMIN)).ok).toBe(false)
    expect((await s.accounts.createAccount({ username: 'a', fullName: 'Người A', roleKey: 'boss' }, ADMIN)).ok).toBe(false)
  })

  it('họ tên trùng tên đăng nhập → từ chối (họ tên in trên giấy tờ)', async () => {
    expect((await s.accounts.createAccount({ username: 'letan', fullName: 'LeTan', roleKey: 'reception' }, ADMIN)).ok).toBe(false)
  })

  it('tên đăng nhập trùng (không phân biệt hoa thường) → từ chối', async () => {
    await s.accounts.createAccount({ username: 'bs.minh', fullName: 'Trần Minh', roleKey: 'doctor' }, ADMIN)
    expect((await s.accounts.createAccount({ username: 'BS.Minh', fullName: 'Trần Minh 2', roleKey: 'doctor' }, ADMIN)).ok).toBe(false)
  })

  it('không được hạ quyền hay tắt Quản trị viên cuối cùng', async () => {
    expect((await s.accounts.updateAccount(1, { roleKey: 'doctor' })).ok).toBe(false)
    expect((await s.accounts.setActive(1, false)).ok).toBe(false)
  })

  it('đổi vai trò → phiên đang mở hết hiệu lực', async () => {
    const { account } = await s.accounts.createAccount({ username: 'nv1', fullName: 'Nhân viên 1', roleKey: 'reception' }, ADMIN)
    expect(s.accounts.sessionStillValid(account.id, 0)).toBe(true)
    await s.accounts.updateAccount(account.id, { roleKey: 'admin' })
    expect(s.accounts.sessionStillValid(account.id, 0)).toBe(false)
  })

  it('mã nhân viên không được trùng', async () => {
    const a = (await s.accounts.createAccount({ username: 'nv1', fullName: 'Nhân viên 1', roleKey: 'reception' }, ADMIN)).account
    const b = (await s.accounts.createAccount({ username: 'nv2', fullName: 'Nhân viên 2', roleKey: 'reception' }, ADMIN)).account
    expect((await s.accounts.updateAccount(b.id, { staffCode: a.staffCode })).ok).toBe(false)
  })
})

describe('Đăng nhập & khoá tài khoản', () => {
  it('đăng nhập đúng (tên đăng nhập không phân biệt hoa thường)', async () => {
    const r = await s.accounts.verifyLogin(' ADMIN ', ADMIN_PW, 'admin')
    expect(r.ok).toBe(true)
    expect(r.account.mustChange).toBe(true)
  })

  it('sai mật khẩu và tài khoản không tồn tại báo cùng một câu (không lộ tài khoản có thật)', async () => {
    const a = await s.accounts.verifyLogin('admin', 'sai', 'admin')
    const b = await s.accounts.verifyLogin('khongco', 'sai', 'admin')
    expect(a.error).toBe(b.error)
  })

  it('đúng mật khẩu nhưng chọn sai vai trò → từ chối', async () => {
    expect((await s.accounts.verifyLogin('admin', ADMIN_PW, 'doctor')).ok).toBe(false)
  })

  it('sai 5 lần liên tiếp → khoá tạm, đúng mật khẩu cũng không vào được', async () => {
    for (let i = 0; i < 4; i++) expect((await s.accounts.verifyLogin('admin', 'sai', 'admin')).error).toMatch(/Incorrect/)
    expect((await s.accounts.verifyLogin('admin', 'sai', 'admin')).error).toMatch(/locked/)
    expect((await s.accounts.verifyLogin('admin', ADMIN_PW, 'admin')).ok).toBe(false)
  })

  it('Quản trị viên mở khoá → đăng nhập lại được', async () => {
    for (let i = 0; i < 5; i++) await s.accounts.verifyLogin('admin', 'sai', 'admin')
    await s.accounts.unlockAccount(1)
    expect((await s.accounts.verifyLogin('admin', ADMIN_PW, 'admin')).ok).toBe(true)
  })

  it('tài khoản đã tắt không đăng nhập được', async () => {
    const r = await s.accounts.createAccount({ username: 'nv1', fullName: 'Nhân viên 1', roleKey: 'reception' }, ADMIN)
    await s.accounts.setActive(r.account.id, false)
    expect((await s.accounts.verifyLogin('nv1', r.password, 'reception')).error).toMatch(/disabled/)
  })

  it('đổi mật khẩu: phải đúng mật khẩu cũ, đủ độ dài, có chữ và số, khác mật khẩu cũ', async () => {
    expect((await s.accounts.changeOwnPassword(1, 'Moi12345', 'sai')).ok).toBe(false)
    expect((await s.accounts.changeOwnPassword(1, 'abc1', ADMIN_PW)).ok).toBe(false)
    expect((await s.accounts.changeOwnPassword(1, 'abcdefghij', ADMIN_PW)).ok).toBe(false)
    expect((await s.accounts.changeOwnPassword(1, ADMIN_PW, ADMIN_PW)).ok).toBe(false)
    expect((await s.accounts.changeOwnPassword(1, 'Moi12345', ADMIN_PW)).ok).toBe(true)
    expect((await s.accounts.verifyLogin('admin', 'Moi12345', 'admin')).account.mustChange).toBe(false)
  })

  it('đặt lại mật khẩu: mật khẩu cũ hết dùng, bắt đổi lần đầu, đá phiên đang mở', async () => {
    const res = await s.accounts.resetPassword(1)
    expect((await s.accounts.verifyLogin('admin', ADMIN_PW, 'admin')).ok).toBe(false)
    expect((await s.accounts.verifyLogin('admin', res.password, 'admin')).account.mustChange).toBe(true)
    expect(s.accounts.sessionStillValid(1, 0)).toBe(false)
  })

  it('đăng xuất cưỡng bức làm phiên cũ hết hiệu lực', async () => {
    await s.accounts.listAccounts()
    await s.accounts.forceSignOut(1)
    expect(s.accounts.sessionStillValid(1, 0)).toBe(false)
    expect(s.accounts.sessionStillValid(1, 1)).toBe(true)
  })
})

describe('Phòng khám cố định (ERD v1.9)', () => {
  it('dữ liệu mẫu: 3 phòng khám + 1 phòng xét nghiệm', async () => {
    const list = await s.rooms.listRooms()
    expect(list.map((r) => r.code)).toEqual(['01', '02', '03', '04'])
    expect(s.rooms.examRooms(list)).toHaveLength(3)
  })

  it('gán bác sĩ vào phòng khám: thấy tên phòng trên tài khoản và trong danh sách phòng', async () => {
    const r = await doctor('bs1', 'room-01')
    expect(r.account).toMatchObject({ roomId: 'room-01', roomName: 'Phòng khám 01' })
    const list = await s.rooms.listRooms({ accounts: await s.accounts.listAccounts() })
    expect(list.find((x) => x.id === 'room-01').physician.name).toBe('BS bs1')
  })

  it('mỗi phòng khám chỉ một bác sĩ đang hoạt động', async () => {
    await doctor('bs1', 'room-01')
    const r = await doctor('bs2', 'room-01')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/BS bs1/)
  })

  it('không gán bác sĩ vào phòng xét nghiệm hay phòng đã ngừng dùng', async () => {
    expect((await doctor('bs1', 'room-04')).ok).toBe(false)
    await s.rooms.updateRoom('room-03', { active: false })
    expect((await doctor('bs2', 'room-03')).ok).toBe(false)
  })

  it('lễ tân / admin không có phòng khám (bỏ qua roomId)', async () => {
    const r = await s.accounts.createAccount({ username: 'nv1', fullName: 'Nhân viên 1', roleKey: 'reception', roomId: 'room-01' }, ADMIN)
    expect(r.account.roomId).toBeNull()
    expect((await doctor('bs1', 'room-01')).ok).toBe(true)
  })

  it('chuyển bác sĩ sang phòng đã có người → từ chối', async () => {
    await doctor('bs1', 'room-01')
    const b = (await doctor('bs2', 'room-02')).account
    expect((await s.accounts.updateAccount(b.id, { roomId: 'room-01' })).ok).toBe(false)
  })

  it('tắt bác sĩ → phòng trống, giao được cho người khác; bật lại người cũ thì báo phòng đã có người', async () => {
    const a = (await doctor('bs1', 'room-01')).account
    await s.accounts.setActive(a.id, false)
    expect((await doctor('bs2', 'room-01')).ok).toBe(true)
    expect((await s.accounts.setActive(a.id, true)).ok).toBe(false)
  })

  it('thêm phòng: bắt buộc mã + tên, mã không trùng (không phân biệt hoa thường)', async () => {
    expect((await s.rooms.createRoom({ code: ' ', name: 'x' })).ok).toBe(false)
    expect((await s.rooms.createRoom({ code: '01', name: 'Trùng' })).ok).toBe(false)
    expect((await s.rooms.createRoom({ code: 'A5', name: 'Phòng khám 05' })).ok).toBe(true)
    expect((await s.rooms.createRoom({ code: 'a5', name: 'Trùng' })).ok).toBe(false)
  })

  it('không ngừng dùng phòng đang có bác sĩ', async () => {
    expect((await s.rooms.updateRoom('room-01', { active: false }, { inUse: true })).ok).toBe(false)
    expect((await s.rooms.updateRoom('room-01', { active: false })).ok).toBe(true)
    expect((await s.rooms.listRooms()).some((r) => r.id === 'room-01')).toBe(false)
    expect((await s.rooms.listRooms({ includeInactive: true })).some((r) => r.id === 'room-01')).toBe(true)
  })

  it('đổi tên phòng: không cho để trống', async () => {
    expect((await s.rooms.updateRoom('room-01', { name: '  ' })).ok).toBe(false)
    expect((await s.rooms.updateRoom('room-01', { name: 'Phòng khám Nhi' })).room.name).toBe('Phòng khám Nhi')
  })
})
