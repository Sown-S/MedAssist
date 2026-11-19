import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Chuông trên thanh trên cùng: có bản cập nhật / lệch phiên bản chưa xem → chuông rung + chấm đỏ;
// mở chuông thì thấy thẻ cập nhật ở đầu popup, chuông thôi rung.
let serverVersion = null
vi.mock('../src/renderer/src/api/connectivity', () => ({ useServerVersion: () => serverVersion }))
vi.mock('../src/renderer/src/api/queueStore', () => ({ useQueue: () => ({ redFlags: [], visits: [], stale: [] }), isMine: () => false, inRoom: () => false, atLabs: () => false, isPendingFlag: () => false }))
vi.mock('../src/renderer/src/api/inventoryStore', () => ({ useInventory: () => ({ drugs: [], batches: [] }), stockOf: () => ({ statuses: [] }) }))
vi.mock('../src/renderer/src/context/AuthContext', () => ({ useAuth: () => ({ user: { roleKey: 'admin', name: 'Quản trị' }, logout: vi.fn() }) }))
const { default: TopActions } = await import('../src/renderer/src/components/TopActions.jsx')

const user = { roleKey: 'admin', name: 'Quản trị', roleLabel: 'Admin' }
const renderBar = () =>
  render(
    <MemoryRouter>
      <div className="top">
        <TopActions user={user} onSignOut={() => {}} />
      </div>
    </MemoryRouter>
  )

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  serverVersion = null
  delete window.api
})

describe('Chuông báo phiên bản', () => {
  it('lệch phiên bản chưa xem: chuông rung, chấm đỏ; mở ra thấy thẻ, thôi rung', () => {
    serverVersion = '99.0.0'
    window.api = { updates: { check: vi.fn(async () => null), openReleases: vi.fn() } }
    const { container } = renderBar()
    const bell = screen.getByRole('button', { name: 'Notifications — a new version is available' })
    expect(bell.className).toContain('bell-ring')
    expect(container.querySelector('.badge-dot.pulse')).toBeTruthy()
    fireEvent.click(bell)
    expect(screen.getByText('A newer app version is available')).toBeTruthy()
    fireEvent.click(screen.getByText('Get the new version'))
    expect(window.api.updates.openReleases).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Notifications' }).className).not.toContain('bell-ring')
    expect(container.querySelector('.badge-dot.pulse')).toBeNull()
  })

  it('phiên bản khớp, không có bản mới: chuông bình thường', () => {
    window.api = { updates: { check: vi.fn(async () => null) } }
    renderBar()
    expect(screen.getByRole('button', { name: 'Notifications' }).className).not.toContain('bell-ring')
  })
})
