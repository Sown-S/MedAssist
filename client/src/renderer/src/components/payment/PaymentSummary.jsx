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

  const totals = [
    ['Consultation', inv.consultation_fee],
    ['Paraclinical', inv.paraclinical_fee],
    ['Medication', inv.drug_fee]
  ]
  return (
    <div>
      <div className="grid-2e mt-14">
        <div className="field">
          {paid ? (
            <>
              <span className="lab">{translate('Payment')}</span>
              <div>
                <span className="badge b-success">{translate('Paid')}</span>
              </div>
              <button className="btn btn-outline self-start mt-8" onClick={() => printReceipt(receiptOf(inv, { name: patient.name, ticket: patient.ticket, byName: user.name }))}>
                <Icon name="printer" />
                {translate('Reprint receipt')}
              </button>
            </>
          ) : (
            <>
              <span className="lab">{translate('Payment method')}</span>
              <div className="seg self-start">
                {methods.map((m) => (
                  <button key={m.key} className={method === m.key ? 'on' : ''} onClick={() => setMethod(m.key)}>
                    <Icon name={m.key === 'transfer' ? 'qr-code' : 'banknote'} />
                    {translate(m.label)}
                  </button>
                ))}
              </div>
              {method === 'transfer' && <span className="hint">{translate('Check that the transfer has arrived in the clinic’s bank account before confirming.')}</span>}
              <Button className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: 8 }} disabled={paying || !editable} onClick={() => pay()}>
                <Icon name="check" />
                {translate(method === 'transfer' ? 'Transfer received — collect' : 'Collect payment')}
              </Button>
            </>
          )}
        </div>
        <div className="rows" style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius)', padding: '4px 14px' }}>
          {totals.map(([l, v]) => (
            <div className="r" key={l}>
              <div className="t">
                <span>{translate(l)}</span>
              </div>
              <span className="num">{fmt(v)}</span>
            </div>
          ))}
          <div className="r">
            <div className="t">
              <b>{translate('Total')}</b>
              <span className="num">
                {inv.invoice_code} · {translate(paid ? 'Paid' : 'Awaiting payment')}
              </span>
            </div>
            <b className="num" style={{ fontSize: 'var(--fs-lg)', color: 'var(--primary-ink)' }}>
              {fmt(inv.total_amount)}
            </b>
          </div>
        </div>
      </div>

      {!paid &&
        (!cancelling ? (
          <button
            className="btn btn-ghost btn-sm text-danger mt-12"
            disabled={!editable || items.some((l) => l.dispense_status === 'Dispensed')}
            onClick={() => setCancelling(true)}
            title={translate('The patient left without paying or taking the medication')}
          >
            {translate('Cancel this visit')}
          </button>
        ) : (
          <div className="field mt-12">
            <label>Reason for cancelling</label>
            <input className="input" type="text" autoFocus value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={translate('e.g. patient left without paying')} />
            <div className="d-flex gap-8 mt-6">
              <button className="btn btn-outline btn-sm" onClick={() => setCancelling(false)}>
                Back
              </button>
              <button className="btn btn-danger btn-sm" disabled={cancelReason.trim().length < 3} onClick={cancelVisitHere}>
                Cancel visit &amp; return stock
              </button>
            </div>
          </div>
        ))}
    </div>
  )
}
