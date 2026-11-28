import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { splitNumber, joinNumber, motionOff } from '../src/renderer/src/api/motion'
import CountUp from '../src/renderer/src/components/CountUp'

describe('api/motion', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('tách và ghép phần số, giữ nguyên định dạng', () => {
    const p = splitNumber('89.000 đ')
    expect(p).toMatchObject({ n: 89000, pre: '', post: ' đ', sep: '.' })
    expect(joinNumber(p, 1234.4)).toBe('1.234 đ')
    expect(splitNumber(12)).toMatchObject({ n: 12 })
    expect(joinNumber(splitNumber(12), 5)).toBe('5')
    expect(splitNumber('94,4%')).toBeNull()
    expect(splitNumber('—')).toBeNull()
    expect(splitNumber(2.5)).toBeNull()
  })

  it('tắt hiệu ứng khi bật Giảm hiệu ứng hoặc không có matchMedia', () => {
    expect(motionOff()).toBe(true) // jsdom không có matchMedia
    localStorage.setItem('medassist_motion', 'reduce')
    expect(motionOff()).toBe(true)
  })

  it('CountUp hiện thẳng giá trị cuối khi tắt hiệu ứng; giá trị không phải số giữ nguyên', () => {
    render(
      <div>
        <span data-testid="a">
          <CountUp value="89.000 đ" />
        </span>
        <span data-testid="b">
          <CountUp value={12} />
        </span>
        <span data-testid="c">
          <CountUp value="94,4%" />
        </span>
      </div>
    )
    expect(screen.getByTestId('a').textContent).toBe('89.000 đ')
    expect(screen.getByTestId('b').textContent).toBe('12')
    expect(screen.getByTestId('c').textContent).toBe('94,4%')
  })
})

describe('Ô số liệu trang chủ', () => {
  it('chưa có dữ liệu thì hiện khung xương, có số thì hiện số (kể cả 0)', async () => {
    const { HomeTile } = await import('../src/renderer/src/components/StatCard')
    const { container, rerender } = render(<HomeTile label="Waiting queue" value={undefined} />)
    expect(container.querySelector('.htile-n .skel-n')).toBeTruthy()
    rerender(<HomeTile label="Waiting queue" value={0} />)
    expect(container.querySelector('.htile-n .skel-n')).toBeNull()
    expect(container.querySelector('.htile-n').textContent).toBe('0')
  })
})

describe('Logo nhịp tim — trạng thái', () => {
  it('mất máy chủ → đỏ; chậm hoặc AI hỏng → cam; AI tắt theo cấu hình không báo; đang tải → đập nhanh', async () => {
    const { pulseState } = await import('../src/renderer/src/components/BrandPulse')
    const ok = { ok: true }
    expect(pulseState({ online: false, slow: false, ai: ok, busy: false })).toBe('down')
    expect(pulseState({ online: true, slow: true, ai: ok, busy: false })).toBe('warn')
    expect(pulseState({ online: true, slow: false, ai: { ok: false, reason: 'unreachable' }, busy: false })).toBe('warn')
    expect(pulseState({ online: true, slow: false, ai: { ok: false, reason: 'disabled' }, busy: false })).toBe('idle')
    expect(pulseState({ online: true, slow: false, ai: ok, busy: true })).toBe('busy')
    expect(pulseState({ online: true, slow: false, ai: ok, busy: false })).toBe('idle')
  })
})
