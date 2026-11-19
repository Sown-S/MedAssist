import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { version } from '../package.json'

let serverVersion = null
vi.mock('../src/renderer/src/api/connectivity', () => ({ useServerVersion: () => serverVersion }))
const { default: UpdateBell } = await import('../src/renderer/src/components/VersionBanners.jsx')

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  serverVersion = null
  delete window.api
})

const stubUpdates = (result) => {
  const openReleases = vi.fn()
  window.api = { updates: { check: vi.fn(async () => result), openReleases } }
  return openReleases
}
const bell = () => screen.getByRole('button', { name: /^Updates/ })

// Chuông cập nhật ở màn đăng nhập: rung + chấm đỏ khi có thông báo chưa xem; bấm mở popup ngay dưới chuông.
describe('Chuông cập nhật (màn đăng nhập)', () => {
  it('GitHub có bản mới: chuông rung, mở ra có thẻ và nút xem bản mới; đã xem thì thôi rung', async () => {
    const openReleases = stubUpdates({ version: '9.9.9' })
    serverVersion = version
    render(<UpdateBell />)
    expect(await screen.findByRole('button', { name: 'Updates — a new version is available' })).toBeTruthy()
    expect(bell().className).toContain('ring')
    fireEvent.click(bell())
    expect(screen.getByText('MedAssist 9.9.9 is available')).toBeTruthy()
    fireEvent.click(screen.getByText('See what’s new'))
    expect(openReleases).toHaveBeenCalledTimes(1)
    expect(bell().className).not.toContain('ring')
  })

  it('không có bản mới, phiên bản khớp: chuông đứng yên, mở ra báo đang dùng bản mới nhất', async () => {
    stubUpdates(null)
    serverVersion = 'v' + version
    render(<UpdateBell />)
    await Promise.resolve()
    expect(bell().className).not.toContain('ring')
    fireEvent.click(bell())
    expect(screen.getByText('You are on the latest version')).toBeTruthy()
  })

  it('máy chủ cũ hơn: thẻ nhắc quản trị viên, kể cả không có window.api (LAN không Internet)', () => {
    serverVersion = '0.0.1'
    render(<UpdateBell />)
    fireEvent.click(bell())
    expect(screen.getByText('The clinic server is not up to date')).toBeTruthy()
    expect(screen.queryByText('Get the new version')).toBeNull()
  })

  it('ứng dụng cũ hơn: nút tải bản mới; ẩn thẻ thì không hiện lại trong phiên', () => {
    const openReleases = stubUpdates(null)
    serverVersion = '99.0.0'
    const { unmount } = render(<UpdateBell />)
    fireEvent.click(bell())
    fireEvent.click(screen.getByText('Get the new version'))
    expect(openReleases).toHaveBeenCalledTimes(1)
    fireEvent.click(bell())
    fireEvent.click(screen.getByRole('button', { name: 'Hide this notice' }))
    expect(screen.queryByText('A newer app version is available')).toBeNull()
    unmount()
    render(<UpdateBell />)
    fireEvent.click(bell())
    expect(screen.queryByText('A newer app version is available')).toBeNull()
  })
})

describe('Chuông cập nhật ở màn đăng nhập', () => {
  it('lệch version với máy chủ: chuông rung ngay trên màn đăng nhập, chưa cần đăng nhập', async () => {
    vi.doMock('../src/renderer/src/context/AuthContext', () => ({
      useAuth: () => ({ authenticate: vi.fn(), startSession: vi.fn(), logout: vi.fn(), notice: '' })
    }))
    vi.doMock('../src/renderer/src/api/accountStore', () => ({ usePasswordMinLength: () => 8 }))
    serverVersion = '0.0.1'
    const { default: Login } = await import('../src/renderer/src/pages/Login.jsx')
    render(<Login />)
    expect(document.querySelector('.login-right > .ubell .ubell-btn.ring')).toBeTruthy()
  })
})
