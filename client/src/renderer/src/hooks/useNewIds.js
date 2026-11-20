import { useEffect, useRef, useState } from 'react'

// Mã của các dòng vừa xuất hiện (không tính lần hiện đầu tiên) — để dòng mới “sáng lên” một nhịp rồi trở lại bình thường.
export default function useNewIds(ids, ms = 2400) {
  const seen = useRef(null)
  const [fresh, setFresh] = useState(() => new Set())
  const key = ids.join('|')
  useEffect(() => {
    const now = new Set(ids)
    if (seen.current === null) {
      seen.current = now
      return
    }
    const added = ids.filter((id) => !seen.current.has(id))
    seen.current = now
    if (!added.length) return
    setFresh((s) => new Set([...s, ...added]))
    const t = setTimeout(() => setFresh((s) => new Set([...s].filter((id) => !added.includes(id)))), ms)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key thay cho mảng ids (mảng mới mỗi lần render); ms coi như cố định
  }, [key])
  return fresh
}
