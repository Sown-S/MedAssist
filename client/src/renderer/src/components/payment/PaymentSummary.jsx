import { useState } from 'react'
import Icon from '../Icon'
import Button from '../Button'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { useToast } from '../../context/ToastContext'
import { getSettings, PAYMENT_METHODS } from '../../api/settingsStore'
import { cancelVisit } from '../../api/clinicApi'
import { payInvoice, toServerMethod, receiptOf } from '../../api/billingApi'
import { printReceipt } from '../queuePrint'
import { translate } from '../../i18n'
import { fmt } from './shared'

// Cột phải tab "Hoá đơn & thanh toán": tổng tiền, hình thức thanh toán, thu tiền (in biên lai), huỷ lượt chưa cấp thuốc.
export default function PaymentSummary({ visitId, inv, paid, editable, items, patient, user, act, onClose }) {
  const { showToast } = useToast()
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const methods = PAYMENT_METHODS.filter((m) => ['cash', 'transfer'].includes(m.key) && getSettings().ops.methods.includes(m.key))
  const [method, setMethod] = useState(methods[0]?.key ?? 'cash')
  const [pay, paying] = useAsyncAction(doPay)

  async function doPay() {
    const r = await act(() => payInvoice(visitId, toServerMethod(method)))
    if (!r) return
    if (r.invoice) printReceipt(receiptOf(r.invoice, { name: patient.name, ticket: patient.ticket, byName: user.name }))
    showToast(r.visit_finished ? 'Payment collected — visit completed' : 'Payment collected — finish dispensing to complete the visit')
  }
  async function cancelVisitHere() {
    const r = await act(() => cancelVisit(visitId, cancelReason.trim()).then(() => true), 'Visit cancelled — undispensed stock returned')
    if (r) onClose()
  }

  return (
    <div>
      <div className="sum-line">
        <span>Consultation</span>
        <span>{fmt(inv.consultation_fee)}</span>
      </div>
      <div className="sum-line">
        <span>Paraclinical</span>
        <span>{fmt(inv.paraclinical_fee)}</span>
      </div>
      <div className="sum-line">
        <span>Medication</span>
        <span>{fmt(inv.drug_fee)}</span>
      </div>
      <div className="sum-total">
        <span>Total</span>
        <span className="amt">{fmt(inv.total_amount)}</span>
      </div>
      <p className="ai-soft mono" style={{ fontSize: 12 }}>
        {inv.invoice_code} · {translate(paid ? 'Paid' : 'Awaiting payment')}
      </p>

      {paid ? (
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => printReceipt(receiptOf(inv, { name: patient.name, ticket: patient.ticket, byName: user.name }))}>
          <Icon name="printer" /> Reprint receipt
        </button>
      ) : (
        <>
          <div className="section-label">Payment method</div>
          <div className="ai-seg">
            {methods.map((m) => (
              <button key={m.key} className={method === m.key ? 'active' : ''} onClick={() => setMethod(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          {method === 'transfer' && (
            <p className="ai-soft" style={{ fontSize: 12.5, marginTop: 8 }}>
              Check that the transfer has arrived in the clinic’s bank account before confirming.
            </p>
          )}
          <Button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={paying || !editable} onClick={() => pay()}>
            {method === 'transfer' ? 'Transfer received — collect' : 'Collect payment'}
          </Button>
          {!cancelling ? (
            <button
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 8 }}
              disabled={!editable || items.some((l) => l.dispense_status === 'Dispensed')}
              onClick={() => setCancelling(true)}
              title={translate('The patient left without paying or taking the medication')}
            >
              <Icon name="x" /> Cancel this visit
            </button>
          ) : (
            <div className="field" style={{ marginTop: 10 }}>
              <label>Reason for cancelling</label>
              <input type="text" autoFocus value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={translate('e.g. patient left without paying')} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setCancelling(false)}>
                  Back
                </button>
                <button className="btn btn-danger btn-sm" disabled={cancelReason.trim().length < 3} onClick={cancelVisitHere}>
                  Cancel visit &amp; return stock
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
