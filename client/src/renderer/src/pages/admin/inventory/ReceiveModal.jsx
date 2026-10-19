import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { receiveStock, daysLeft, todayISO } from '../../../api/inventoryStore'
import { unitLabel, fmtMoney } from './shared'

// Nhập kho = tạo 1 LÔ mới (backend: POST /inventory/batches). Không quản lý nhà cung cấp / công nợ (Proposal §6.2).
export default function ReceiveModal({ drug, drugs, user, onClose }) {
  const { showToast } = useToast()
  const [f, setF] = useState(null)
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (drug) {
      setF({ drugId: drug.id ?? drugs.find((d) => d.active)?.id, lot: '', expiry: '', qty: '', cost: '' })
      setTried(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drug])
  if (!drug || !f) return null
  const d = drugs.find((x) => x.id === f.drugId)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const qty = parseInt(f.qty, 10)
  const cost = f.cost === '' ? d?.cost : Number(f.cost)

  const errors = []
  if (!f.lot.trim()) errors.push('Enter the batch (lot) number.')
  if (!f.expiry) errors.push('Enter the expiry date.')
  else if (daysLeft(f.expiry) < 0) errors.push('This batch has already expired — expired stock cannot be received.')
  if (!(qty > 0)) errors.push('Enter a quantity greater than 0.')
  if (!(cost >= 0)) errors.push('Enter the purchase price.')
  const shortLife = f.expiry && daysLeft(f.expiry) >= 0 && daysLeft(f.expiry) < 180

  function save() {
    setTried(true)
    if (errors.length) return
    receiveStock({ drugId: f.drugId, lot: f.lot.trim().toUpperCase(), expiry: f.expiry, qty, cost }, user)
    showToast('Stock received')
    onClose()
  }

  return (
    <Modal open onClose={onClose}>
      <ModalHeader title="Receive stock" onClose={onClose} />
      <div className="modal-body">
        <div className="ai-grid3">
          <div className="field" style={{ gridColumn: 'span 3' }}>
            <label>Drug</label>
            <select value={f.drugId} onChange={(e) => set('drugId', e.target.value)} disabled={!!drug.id}>
              {drugs
                .filter((x) => x.active)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>
              Lot number <span className="ai-req">*</span>
            </label>
            <input value={f.lot} onChange={(e) => set('lot', e.target.value)} />
          </div>
          <div className="field">
            <label>
              Expiry date <span className="ai-req">*</span>
            </label>
            <input type="date" min={todayISO()} value={f.expiry} onChange={(e) => set('expiry', e.target.value)} />
          </div>
          <div className="field">
            <label>
              Quantity <span className="ai-soft">({d ? unitLabel(d.unit) : ''})</span> <span className="ai-req">*</span>
            </label>
            <input type="number" min="1" value={f.qty} onChange={(e) => set('qty', e.target.value)} />
          </div>
          <div className="field">
            <label>Purchase price (per unit)</label>
            <input type="number" min="0" value={f.cost} placeholder={cost >= 0 ? String(cost) : ''} onChange={(e) => set('cost', e.target.value)} />
          </div>
        </div>

        {qty > 0 && cost >= 0 && (
          <div className="rc-facts">
            <span>
              <span>Receipt value</span> <b className="mono">{fmtMoney(qty * cost)}</b>
            </span>
          </div>
        )}
        {shortLife && (
          <div className="warn-banner show caution">
            <div className="icon">
              <Icon name="alert" />
            </div>
            <div className="txt">This batch expires in less than 6 months.</div>
          </div>
        )}
        {tried && errors.length > 0 && (
          <div className="warn-banner show danger">
            <div className="icon">
              <Icon name="ban" />
            </div>
            <div className="txt">
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save}>
          Receive stock
        </button>
      </div>
    </Modal>
  )
}
