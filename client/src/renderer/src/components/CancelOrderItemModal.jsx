import { useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import Icon from './Icon'
import { translate } from '../i18n'
import { cancelServiceOrderItem } from '../api/serviceApi'
import { apiMessage } from '../api/serviceStore'

// Huỷ một dòng chỉ định cận lâm sàng bệnh nhân không làm (POST /service-order-items/{id}/cancel, ERD v2.1).
// Bác sĩ: lượt đang khám. Lễ tân: lượt chờ thu tiền — hoá đơn tự lập lại. Dòng đã có kết quả thì server từ chối.
// item: { itemId, name }; onDone() sau khi huỷ xong để màn hình nạp lại.
export default function CancelOrderItemModal({ item, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (reason.trim().length < 3) return setError(translate('Enter a reason (at least 3 characters).'))
    setBusy(true)
    try {
      await cancelServiceOrderItem(item.itemId, reason.trim())
      onDone()
    } catch (e) {
      setError(translate(apiMessage(e)))
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose}>
      <ModalHeader title={translate('Cancel order line') + ' — ' + item.name} onClose={onClose} />
      <div className="modal-body">
        <p className="ai-soft">The patient did not have this test or service done. It is removed from the invoice; the order keeps the line as cancelled.</p>
        <div className="field">
          <label>Reason *</label>
          <input type="text" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Patient declined the ultrasound" />
        </div>
        {error && <div className="login-err show">{error}</div>}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Keep it
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          <Icon name="x" /> Cancel this line
        </button>
      </div>
    </Modal>
  )
}
