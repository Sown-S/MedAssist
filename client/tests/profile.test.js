import { describe, it, expect } from 'vitest'
import { profileFromArgs } from '../src/main/profile'

describe('Hồ sơ dữ liệu theo --profile', () => {
  it('không có tham số thì dùng thư mục mặc định', () => {
    expect(profileFromArgs(['MedAssist.exe'])).toBeNull()
  })

  it('nhận tên hợp lệ, đưa về chữ thường', () => {
    expect(profileFromArgs(['MedAssist.exe', '--profile=BacSi-1'])).toBe('bacsi-1')
  })

  it('bỏ qua tên có thể ghi ra ngoài thư mục appData', () => {
    for (const bad of ['--profile=', '--profile=../x', '--profile=a/b', '--profile=a b', '--profile=' + 'a'.repeat(33)]) {
      expect(profileFromArgs(['MedAssist.exe', bad])).toBeNull()
    }
  })
})
