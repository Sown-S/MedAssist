import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { version } from '../package.json'

let serverVersion = null
vi.mock('../src/renderer/src/api/connectivity', () => ({ useServerVersion: () => serverVersion }))
const { default: VersionBanners } = await import('../src/renderer/src/components/VersionBanners.jsx')

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

describe('Banner phiên bản', () => {
  it('GitHub có bản mới: hiện banner, nút mở trang phát hành', async () => {
    const openReleases = stubUpdates({ version: '9.9.9' })
    serverVersion = version
    render(<VersionBanners />)
    expect(await screen.findByText('MedAssist 9.9.9 is available')).toBeTruthy()
    fireEvent.click(screen.getByText('See what’s new'))
    expect(openReleases).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.vnote.warn')).toBeNull()
  })

  it('không có bản mới / mất mạng và version khớp server: không hiện gì', async () => {
    stubUpdates(null)
    serverVersion = 'v' + version
    const { container } = render(<VersionBanners />)
    await Promise.resolve()
    expect(container.innerHTML).toBe('')
  })

  it('máy chủ cũ hơn ứng dụng: báo quản trị viên cập nhật máy chủ, kể cả không có window.api (LAN không Internet)', () => {
    serverVersion = '0.0.1'
    render(<VersionBanners />)
    expect(screen.getByText('The clinic server is not up to date')).toBeTruthy()
    expect(screen.getByText('0.0.1')).toBeTruthy()
    expect(screen.queryByText('Get the new version')).toBeNull()
  })

  it('ứng dụng cũ hơn máy chủ: nút tải bản mới; ẩn thì không hiện lại trong phiên', () => {
    const openReleases = stubUpdates(null)
    serverVersion = '99.0.0'
    const { unmount } = render(<VersionBanners />)
    expect(screen.getByText('A newer app version is available')).toBeTruthy()
    fireEvent.click(screen.getByText('Get the new version'))
    expect(openReleases).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Hide this notice' }))
    expect(screen.queryByText('A newer app version is available')).toBeNull()
    unmount()
    render(<VersionBanners />)
    expect(screen.queryByText('A newer app version is available')).toBeNull()
  })
})

describe('Banner phiên bản ở màn đăng nhập', () => {
  it('lệch version với máy chủ: hiện ngay trên màn đăng nhập, chưa cần đăng nhập', async () => {
    vi.doMock('../src/renderer/src/context/AuthContext', () => ({
      useAuth: () => ({ authenticate: vi.fn(), startSession: vi.fn(), logout: vi.fn(), notice: '' })
    }))
    vi.doMock('../src/renderer/src/api/accountStore', () => ({ usePasswordMinLength: () => 8 }))
    serverVersion = '0.0.1'
    const { default: Login } = await import('../src/renderer/src/pages/Login.jsx')
    render(<Login />)
    expect(screen.getByText('The clinic server is not up to date')).toBeTruthy()
    expect(document.querySelector('.login-right > .login-banners + .login-form')).toBeTruthy()
  })
})
