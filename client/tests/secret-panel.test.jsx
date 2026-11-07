import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, fireEvent, cleanup } from '@testing-library/react'
import { renderPage } from './render.jsx'
import { ADMIN } from './helpers'
import SecretPanel from '../src/renderer/src/pages/admin/staff/SecretPanel.jsx'

// Mật khẩu tạm chỉ hiện một lần: nút Sao chép phải báo rõ khi máy chặn clipboard, không im lặng.
const secret = { account: { username: 'bs.an', fullName: 'Nguyễn Văn An' }, password: 'Tmp#2026abc' }
const stubClipboard = (writeText) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

describe('Nút Sao chép mật khẩu tạm', () => {
  afterEach(() => {
    cleanup()
    delete navigator.clipboard
  })

  it('chép được → ghi tên đăng nhập và mật khẩu, nút đổi thành "Đã sao chép"', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    renderPage(<SecretPanel secret={secret} onClose={() => {}} />, { user: ADMIN })
    fireEvent.click(await screen.findByText('Copy'))
    expect(await screen.findByText('Copied')).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('bs.an\nTmp#2026abc')
  })

  it('máy chặn clipboard → báo lỗi để sao chép tay', async () => {
    stubClipboard(vi.fn(async () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'))))
    renderPage(<SecretPanel secret={secret} onClose={() => {}} />, { user: ADMIN })
    fireEvent.click(await screen.findByText('Copy'))
    expect(await screen.findByText('Could not copy — select the password and copy it by hand')).toBeTruthy()
    expect(screen.queryByText('Copied')).toBeNull()
  })
})
