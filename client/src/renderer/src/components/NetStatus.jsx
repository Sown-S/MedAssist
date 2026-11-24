import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Icon from './Icon'
import { translate } from '../i18n'
import { subscribePending, isRequestPending } from '../api/client'
import { useServerOnline, useServerSlow, subscribeNextProbe, getNextProbeAt, probeNow } from '../api/connectivity'

// Trạng thái kết nối dùng chung cho mọi vai trò:
// - TopProgress: thanh mảnh trên cùng khi có yêu cầu chờ quá 300 ms (không phải % giả, chỉ báo “đang chờ”).
// - SlowNotice: thông báo nổi khi một yêu cầu chờ quá 5 giây.
// - OfflineBanner: mất kết nối → banner cố định, đếm ngược tới lần thử lại, nút “Thử lại ngay”; có lại → “Đã kết nối lại”.

// Thanh tải kiểu YouTube ở mép dưới thanh trên: đổi trang hoặc có yêu cầu đang chờ → thanh xanh mảnh chạy dần tới ~85%;
// xong → chạy nốt tới 100% rồi mờ đi. navKey đổi (đổi mục thanh bên) thì luôn chạy một lượt ngắn.
export function TopProgress({ navKey }) {
  const pending = useSyncExternalStore(subscribePending, isRequestPending)
  const [phase, setPhase] = useState('idle') // idle | run | done
  const first = useRef(true)
  const navAt = useRef(0)
  useEffect(() => {
    if (first.current) return void (first.current = false)
    navAt.current = Date.now()
    setPhase('run')
  }, [navKey])
  useEffect(() => {
    if (pending) return setPhase('run')
    // Đổi trang mà không có yêu cầu nào: vẫn cho thanh chạy tối thiểu 350 ms rồi mới hoàn tất.
    const wait = Math.max(0, 350 - (Date.now() - navAt.current))
    const t = setTimeout(() => setPhase((p) => (p === 'run' ? 'done' : p)), wait)
    return () => clearTimeout(t)
  }, [pending, navKey])
  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(() => setPhase('idle'), 450)
    return () => clearTimeout(t)
  }, [phase])
  return (
    <div className={'net-bar ' + phase} role="progressbar" aria-hidden={phase === 'idle'} aria-label={translate('Loading…')}>
      <i />
    </div>
  )
}

export function SlowNotice() {
  const online = useServerOnline()
  const slow = useServerSlow()
  if (!slow || !online) return null
  return (
    <div className="net-toast" role="status">
      <span className="spin" aria-hidden="true" />
      <div>
        <b>{translate('The server is responding slowly — still waiting…')}</b>
        <span>{translate('Your data is still being saved. If there is no answer after 45 seconds it stops and you can try again.')}</span>
      </div>
    </div>
  )
}

function useCountdown(active) {
  const nextAt = useSyncExternalStore(subscribeNextProbe, getNextProbeAt)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return Math.max(0, Math.ceil((nextAt - now) / 1000))
}

// children: câu giải thích riêng của từng màn (VD lễ tân: những thao tác nào bị khoá).
export function OfflineBanner({ children, style }) {
  const online = useServerOnline()
  const left = useCountdown(!online)
  const [back, setBack] = useState(false)
  const wasOff = useRef(false)
  const [trying, setTrying] = useState(false)

  useEffect(() => {
    if (!online) {
      wasOff.current = true
      return
    }
    if (!wasOff.current) return
    wasOff.current = false
    setBack(true)
    const t = setTimeout(() => setBack(false), 3000)
    return () => clearTimeout(t)
  }, [online])

  async function retry() {
    setTrying(true)
    try {
      await probeNow()
    } finally {
      setTrying(false)
    }
  }

  if (online && back)
    return (
      <div className="banner s net-banner" role="status" style={style}>
        <Icon name="circle-check" />
        <div className="txt">
          <b>{translate('Reconnected to the clinic server')}</b>
        </div>
      </div>
    )
  if (online) return null
  return (
    <div className="banner w net-banner" role="alert" style={style}>
      <Icon name="wifi-off" />
      <div className="txt">
        <b>{translate('No connection to the clinic server — read-only mode')}</b>
        {children ?? <span>{translate('Saving is blocked until the connection returns; what is on screen was loaded earlier.')}</span>}
        <span className="small">{trying ? translate('Trying to reconnect…') : left > 0 ? translate(`Trying again in ${left} s`) : translate('Trying to reconnect…')}</span>
      </div>
      <button className="btn btn-outline btn-sm" disabled={trying} onClick={retry}>
        <Icon name="refresh-cw" />
        {translate('Try again now')}
      </button>
    </div>
  )
}
