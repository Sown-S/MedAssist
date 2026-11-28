import { useState } from 'react'
import Icon from './Icon'
import ConfirmModal from './ConfirmModal'

// Đánh giá lại cho phép hạ mức (POST /visits/{id}/assessment {allow_lower: true}): lưu thường chỉ nâng mức,
// gõ nhầm sinh hiệu làm bật cờ đỏ thì sửa lại rồi bấm nút này. Có hộp xác nhận vì có thể gỡ cờ đỏ.
export default function LowerPriorityButton({ onConfirm, disabled = false, className = 'btn btn-outline btn-sm' }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  async function confirm() {
    setAsking(false)
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className={className} disabled={disabled || busy} onClick={() => setAsking(true)}>
        <Icon name="repeat" /> Re-assess, allow lowering
      </button>
      <ConfirmModal
        open={asking}
        message="Re-assess with the current data — the priority may be lowered and the red flag removed; this action is logged."
        confirmLabel="Re-assess"
        onCancel={() => setAsking(false)}
        onConfirm={confirm}
      />
    </>
  )
}
