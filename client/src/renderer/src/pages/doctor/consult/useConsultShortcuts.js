import { useEffect, useRef } from 'react'
import { DRUG_SEARCH_ID } from './RxEditor'

// Phím tắt: Ctrl+Enter chốt đơn, Alt+D nhận gợi ý đứng đầu, Alt+T tới ô tìm thuốc, Alt+L chỉ định xét nghiệm.
// Hàm truyền vào đổi theo mỗi lần dựng → giữ trong ref, chỉ gắn listener một lần.
export function useConsultShortcuts({ finalize, acceptTop, openLab }) {
  const ref = useRef(null)
  ref.current = { finalize, acceptTop, openLab }
  useEffect(() => {
    const onKey = (e) => {
      const alt = e.altKey && !e.ctrlKey && !e.metaKey
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        ref.current.finalize(e.shiftKey)
      } else if (alt && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        ref.current.openLab()
      } else if (alt && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        ref.current.acceptTop()
      } else if (alt && e.key.toLowerCase() === 't') {
        e.preventDefault()
        document.getElementById(DRUG_SEARCH_ID)?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
