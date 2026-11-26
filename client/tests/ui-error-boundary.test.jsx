import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../src/renderer/src/i18n/index.js'
import ErrorBoundary from '../src/renderer/src/components/ErrorBoundary.jsx'

let broken
function Fragile() {
  if (broken) throw new Error('Dữ liệu lạ từ server')
  return <p>Màn hình bình thường</p>
}
function Page({ resetKey }) {
  return (
    <ErrorBoundary resetKey={resetKey}>
      <Fragile />
    </ErrorBoundary>
  )
}

afterEach(() => cleanup())

describe('ErrorBoundary', () => {
  it('màn lỗi → hiện thông báo kèm nội dung lỗi thay vì trắng trang', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    broken = true
    render(<Page resetKey="a" />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Something went wrong on this screen')).toBeTruthy()
    expect(screen.getByText('Dữ liệu lạ từ server')).toBeTruthy()
  })

  it('"Try again" dựng lại màn khi lỗi đã hết', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    broken = true
    render(<Page resetKey="a" />)
    broken = false
    fireEvent.click(screen.getByText('Try again'))
    expect(screen.getByText('Màn hình bình thường')).toBeTruthy()
  })

  it('chuyển sang trang khác (resetKey đổi) → tự hết thông báo lỗi', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    broken = true
    function Nav() {
      const [key, setKey] = useState('a')
      return (
        <>
          <button onClick={() => ((broken = false), setKey('b'))}>Đổi trang</button>
          <Page resetKey={key} />
        </>
      )
    }
    render(<Nav />)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByText('Đổi trang'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Màn hình bình thường')).toBeTruthy()
  })
})

describe('ErrorBoundary inline', () => {
  it('phần con lỗi chỉ hiện một dòng báo, phần còn lại vẫn hiện', () => {
    const Boom = () => {
      throw new Error('hỏng')
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <p>Phần khám bệnh</p>
        <ErrorBoundary inline label="The chart could not be shown.">
          <Boom />
        </ErrorBoundary>
      </div>
    )
    expect(screen.getByText('Phần khám bệnh')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('The chart could not be shown.')
    spy.mockRestore()
  })
})
