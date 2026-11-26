import { createPortal } from 'react-dom'
import Icon from './Icon'

// Hộp xác nhận xoá (kiểu "confirm" của bản mẫu). Bấm ra vùng mờ không huỷ; chỉ nút Hủy mới huỷ.
export default function ConfirmModal({ open, message, onConfirm, onCancel, confirmLabel = 'Delete' }) {
  if (!open) return null
  return createPortal(
    <div className="ov show">
      <div className="modal sm" role="alertdialog" aria-modal="true">
        <div className="modal-b">
          <div className="confirm">
            <div className="ico d">
              <Icon name="triangle-alert" />
            </div>
            <p>{message}</p>
          </div>
        </div>
        <div className="modal-f confirm-actions">
          <button className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
