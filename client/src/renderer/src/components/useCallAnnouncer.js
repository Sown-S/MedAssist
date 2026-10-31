import { useEffect, useMemo, useRef } from 'react'
import { useQueue, invitesOf } from '../api/queueStore'
import { DEMO_MODE } from '../api/client'

// Báo ở quầy Lễ tân: mỗi khi bác sĩ báo sẵn sàng nhận người tiếp (queueStore.calls), máy quầy phát tiếng "ding"
// để lễ tân nhìn màn hình và GỌI MIỆNG bệnh nhân vào đúng phòng. Không còn loa đọc số tự động.
// Gắn ở cấp trang Tiếp đón nên đang ở màn nào cũng nghe. Chỉ báo lần gọi phát sinh SAU khi mở trang (không báo lại lịch sử).

// "P.101" → "phòng 101" — câu gợi ý để lễ tân đọc khi gọi.
const roomWords = (room) => (room ? 'phòng ' + room.replace(/^p(hòng)?\.?\s*/i, '') : 'phòng khám')
export const callText = (c) => `Mời số ${String(c.ticket).padStart(3, '0')} vào ${roomWords(c.room)}`

function ding() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.65)
    setTimeout(() => ctx.close(), 900)
  } catch {
    /* máy không phát được âm thanh — chỉ hiện trên màn hình */
  }
}

// Backend thật: lời mời nằm ở GET /queue (called_at) — mỗi called_at mới (mời / gọi lại) giữa hai lần tải là một lần báo.
const liveCalls = (visits) => invitesOf(visits).map((v) => ({ id: v.id + '@' + v.calledAt }))

export default function useCallAnnouncer() {
  const { calls: localCalls = [], visits } = useQueue()
  const calls = useMemo(() => (DEMO_MODE ? localCalls : liveCalls(visits)), [localCalls, visits])
  const seen = useRef(null)
  useEffect(() => {
    // Lần đầu: ghi nhận các lần gọi đã có, không báo lại.
    if (seen.current === null) {
      seen.current = new Set(calls.map((c) => c.id))
      return
    }
    const fresh = calls.filter((c) => !seen.current.has(c.id))
    fresh.forEach((c) => seen.current.add(c.id))
    if (fresh.length) ding()
  }, [calls])
}
