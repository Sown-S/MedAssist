import { useEffect, useState, useSyncExternalStore } from 'react'
import { Logo } from './Icon'
import { translate } from '../i18n'
import { useServerOnline, useServerSlow, useAiHealth } from '../api/connectivity'
import { subscribePending, isRequestPending } from '../api/client'

// Logo nhịp tim ở thanh bên báo tình trạng hệ thống bằng nhịp đập và màu:
//   idle  — xanh, đập chậm (mỗi ~3 giây)
//   busy  — xanh, đập nhanh hơn khi đang chờ dữ liệu quá 300 ms (giống màn khởi động)
//   warn  — cam: máy chủ chậm phản hồi (yêu cầu chờ quá 5 giây) hoặc dịch vụ AI không chạy
//   down  — đỏ: máy chủ không phản hồi
// Màu là thông tin nên vẫn đổi khi bật Giảm hiệu ứng; chỉ nhịp đập tắt (CSS).
const BUSY_AFTER_MS = 300
const BUSY_HOLD_MS = 700 // giữ nhịp nhanh thêm một chút để các lượt tải ngắn liên tiếp không làm logo giật

function useBusy() {
  const pending = useSyncExternalStore(subscribePending, isRequestPending)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setBusy(pending), pending ? BUSY_AFTER_MS : BUSY_HOLD_MS)
    return () => clearTimeout(t)
  }, [pending])
  return busy
}

export const pulseState = ({ online, slow, ai, busy }) => {
  if (!online) return 'down'
  // AI tắt hẳn theo cấu hình (disabled) là chủ ý của phòng khám, không phải sự cố → không báo cam.
  if (slow || (ai && !ai.ok && ai.reason !== 'disabled')) return 'warn'
  return busy ? 'busy' : 'idle'
}

const TIP = {
  idle: 'System running normally',
  busy: 'Loading data…',
  down: 'The clinic server is not responding'
}

export default function BrandPulse() {
  const online = useServerOnline()
  const slow = useServerSlow()
  const ai = useAiHealth()
  const busy = useBusy()
  const state = pulseState({ online, slow, ai, busy })
  const tip = state === 'warn' ? (slow ? 'The server is responding slowly' : 'The AI service is not responding') : TIP[state]
  return (
    <span className={'brand-pulse ' + state} title={translate(tip)} role="img" aria-label={translate(tip)}>
      <Logo />
    </span>
  )
}
