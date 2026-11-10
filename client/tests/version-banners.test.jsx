import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { version } from '../package.json'

let serverVersion = null
vi.mock('../src/renderer/src/api/connectivity', () => ({ useServerVersion: () => serverVersion }))
const { default: VersionBanners } = await import('../src/renderer/src/components/VersionBanners.jsx')

afterEach(() => {
  cleanup()
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
    expect(await screen.findByText('Version 9.9.9 is available')).toBeTruthy()
    fireEvent.click(screen.getByText('Open release page'))
    expect(openReleases).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/differs from the server/)).toBeNull()
  })

  it('không có bản mới / mất mạng và version khớp server: không hiện gì', async () => {
    stubUpdates(null)
    serverVersion = 'v' + version
    const { container } = render(<VersionBanners />)
    await Promise.resolve()
    expect(container.innerHTML).toBe('')
  })

  it('version client khác máy chủ: cảnh báo, kể cả không có window.api (mạng LAN không Internet)', () => {
    serverVersion = '0.0.1'
    render(<VersionBanners />)
    expect(screen.getByText(`App version (${version}) differs from the server (0.0.1), update to avoid errors`)).toBeTruthy()
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
    expect(screen.getByText(`App version (${version}) differs from the server (0.0.1), update to avoid errors`)).toBeTruthy()
    expect(document.querySelector('.login-banners + .login-card')).toBeTruthy()
  })
})
