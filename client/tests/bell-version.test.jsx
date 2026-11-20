import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Chuông trên thanh trên cùng chỉ chứa thông báo công việc; thông báo cập nhật nằm ở chuông màn đăng nhập.
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

describe('Chuông trên thanh trên cùng', () => {
  it('chỉ có thông báo công việc: không rung, không có mục cập nhật kể cả khi lệch phiên bản', () => {
    serverVersion = '99.0.0'
    window.api = { updates: { check: vi.fn(async () => null), openReleases: vi.fn() } }
    renderBar()
    const bell = screen.getByRole('button', { name: 'Notifications' })
    expect(bell.className).not.toContain('ring')
    fireEvent.click(bell)
    expect(screen.queryByText('A newer app version is available')).toBeNull()
    expect(document.querySelector('.bell-menu')).toBeTruthy()
  })
})
