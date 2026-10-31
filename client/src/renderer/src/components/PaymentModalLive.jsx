import { useCallback, useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import Icon from './Icon'
import Button from './Button'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useServiceCatalog } from '../api/serviceStore'
import { fetchServiceOrders } from '../api/serviceApi'
import CancelOrderItemModal from './CancelOrderItemModal'
import { getSettings, PAYMENT_METHODS } from '../api/settingsStore'
import { getPrescription } from '../api/examApi'
import { cancelVisit } from '../api/clinicApi'
import { getInvoice, editInvoice, payInvoice, dispenseItem, dispenseAll, toServerMethod, receiptOf } from '../api/billingApi'
import { syncQueue } from '../api/queueStore'
import { unitLabel, printHtml, esc } from '../pages/admin/inventory/shared'
import { printReceipt } from './queuePrint'
import { translate } from '../i18n'

// CẤP PHÁT & THU TIỀN với backend thật (billing_router): đọc đơn + hóa đơn của lượt khám từ server, mọi thao tác gọi API
// rồi tải lại — server là nguồn sự thật (kho, hóa đơn, trạng thái lượt khám). Bản giả lập: PaymentModal.jsx.
// ERD v2.1: hoá đơn tự có dòng cận lâm sàng từ phiếu chỉ định (service_order_id) — quầy không sửa được, chỉ huỷ chỉ định
// (hoá đơn tự lập lại); dòng nhập tay sửa như cũ. Chỉ định ngoài danh mục chưa có giá nằm ở unbilled_items để quầy thêm tay.
const fmt = (n) => Math.max(Number(n) || 0, 0).toLocaleString('vi-VN') + 'đ'
const DS = {
  Pending: { label: 'Waiting to dispense', cls: 'warn' },
  Dispensed: { label: 'Dispensed', cls: 'ok' },
  Skipped: { label: 'Skipped', cls: 'muted' }
}

export default function PaymentModalLive({ open, onClose, patient, initialTab = 'dispense' }) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const cat = useServiceCatalog()
  const [orders, setOrders] = useState([])
  const [cancelLine, setCancelLine] = useState(null) // dòng chỉ định đang huỷ
  const [rx, setRx] = useState(null)
  const [inv, setInv] = useState(undefined) // undefined = đang tải, null = không có hóa đơn
  const [err, setErr] = useState('')
  const [tab, setTab] = useState(initialTab === 'pay' ? 'pay' : 'dispense')
  const [skipping, setSkipping] = useState(null)
  const [skipReason, setSkipReason] = useState('')
  const [adding, setAdding] = useState('')
  const [custom, setCustom] = useState({ name: '', amount: '' })
  const [fee, setFee] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const methods = PAYMENT_METHODS.filter((m) => ['cash', 'transfer'].includes(m.key) && getSettings().ops.methods.includes(m.key))
  const [method, setMethod] = useState(methods[0]?.key ?? 'cash')
  const visitId = patient?.id

  const load = useCallback(async () => {
    try {
      const [p, i, o] = await Promise.all([getPrescription(visitId), getInvoice(visitId), fetchServiceOrders(visitId)])
      setRx(p)
      setInv(i)
      setOrders(o)
      setFee(i ? String(Number(i.consultation_fee)) : '')
      setErr('')
    } catch (e) {
      setErr(e.message)
    }
  }, [visitId])
  useEffect(() => {
    if (open && visitId) load()
  }, [open, visitId, load])

  // Mọi thao tác: gọi API → tải lại đơn + hóa đơn + hàng đợi; trả kết quả cho nơi gọi.
  async function act(fn, ok) {
    try {
      const r = await fn()
      await load()
      syncQueue()
      if (ok) showToast(translate(ok))
      return r
    } catch (e) {
      showToast(e.message)
      return null
    }
  }
  const [pay, paying] = useAsyncAction(doPay)

  if (!open || !patient) return null
  const items = rx?.items ?? []
  const waiting = items.filter((l) => l.dispense_status === 'Pending')
  const paid = inv?.payment_status === 'Paid'
  const editable = inv?.payment_status === 'Pending'
  const paraclinical = (inv?.items ?? []).filter((x) => x.item_type === 'Paraclinical')
  // Dòng nhập tay (quầy sửa được) và dòng sinh từ phiếu chỉ định (chỉ huỷ được chỉ định).
  const services = paraclinical.filter((x) => !x.service_order_id)
  const ordered = paraclinical.filter((x) => x.service_order_id)
  const consultLine = (inv?.items ?? []).find((x) => x.item_type === 'Consultation')
  // Chỉ định ngoài danh mục chưa có giá; server đã bỏ những mục quầy thêm tay cùng tên.
  const unbilled = inv?.unbilled_items ?? []
  const consultServices = cat.services.filter((s) => s.kind === 'Service' && s.group_key === 'consult' && s.is_active !== false)
  // Dòng hoá đơn từ chỉ định → dòng chỉ định tương ứng (để huỷ). Dòng gói ("Gói: …") không huỷ riêng ở quầy.
  const orderItemOf = (x) =>
    orders
      .find((o) => o.order_id === x.service_order_id)
      ?.items.find((it) => it.status === 'Ordered' && !it.in_package && it.item_name === x.item_name)
  const drugItems = (inv?.items ?? []).filter((x) => x.item_type === 'Drug')
  const ticket = patient.ticket ? String(patient.ticket).padStart(3, '0') : ''

  // ---------- Cấp phát ----------
  const markDispensed = (l) => act(() => dispenseItem(l.item_id, 'Dispensed'))
  async function confirmSkip() {
    const r = await act(() => dispenseItem(skipping, 'Skipped', skipReason.trim()), 'Skipped — stock returned and the invoice re-issued')
    if (r) {
      setSkipping(null)
      setSkipReason('')
    }
  }
  const all = () => act(() => dispenseAll(visitId), 'All drugs recorded as dispensed')

  // ---------- Dòng cận lâm sàng (thay toàn bộ danh sách NHẬP TAY; dòng từ chỉ định server tự giữ) ----------
  const asLine = (x) => ({ item_name: x.item_name, quantity: x.quantity, unit_price: Number(x.unit_price) })
  const saveServices = (next) => act(() => editInvoice(visitId, { paraclinical_items: next }), 'Invoice updated')
  function addFromCatalog(id) {
    setAdding('')
    const row = cat.services.find((x) => x.service_id === id)
    if (row) saveServices([...services.map(asLine), { item_name: row.name, quantity: 1, unit_price: Number(row.price) || 0 }])
  }
  // Đổi dịch vụ khám (vd Khám chuyên khoa Nhi): tên và giá theo danh mục.
  const changeConsult = (id) => id && act(() => editInvoice(visitId, { consultation_service_id: id }), 'Invoice updated')
  function addCustom() {
    if (!custom.name.trim() || custom.amount === '' || !(Number(custom.amount) >= 0)) return showToast(translate('Each service line needs a name and an amount.'))
    saveServices([...services.map(asLine), { item_name: custom.name.trim(), quantity: 1, unit_price: Number(custom.amount) }])
    setCustom({ name: '', amount: '' })
  }
  const removeService = (idx) => saveServices(services.filter((_, j) => j !== idx).map(asLine))
  const saveFee = () => (Number(fee) >= 0 && fee !== '' ? act(() => editInvoice(visitId, { consultation_fee: Number(fee) }), 'Invoice updated') : showToast(translate('Enter an amount')))

  // ---------- Thu tiền ----------
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

  function printSlip() {
    const t = translate
    const rows = items
      .filter((l) => l.dispense_status !== 'Skipped')
      .map((l, n) => `<tr><td>${n + 1}</td><td><b>${esc(l.drug_name)}</b><br><small>${esc([l.dosage, l.frequency, l.duration_days + ' ngày'].join(' · '))}</small></td><td class="num">${esc(l.quantity)} ${esc(t(unitLabel(l.unit)))}</td></tr>`)
      .join('')
    if (!rows) return showToast(translate('No drugs to dispense on this invoice.'))
    printHtml(
      t('Dispensing slip'),
      `<h1>${esc(t('Dispensing slip'))}</h1>
      <p class="meta">${esc(t('Patient'))}: <b>${esc(patient.name)}</b>${ticket ? ' · ' + esc(t('no.')) + ' ' + esc(ticket) : ''}</p>
      <p class="meta">${new Date().toLocaleString('vi-VN')} · ${esc(user.name)}</p>
      ${rx?.patient_context?.allergy_notes ? `<p class="meta">${esc(t('Drug allergy'))}: <b>${esc(rx.patient_context.allergy_notes)}</b></p>` : ''}
      <table><thead><tr><th>#</th><th>${esc(t('Drug'))}</th><th class="num">${esc(t('Quantity'))}</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sign"><div>${esc(t('Dispensed by'))}<i>(${esc(t('Signature, full name'))})</i></div><div></div><div>${esc(t('Patient received'))}<i>(${esc(t('Signature, full name'))})</i></div></div>`,
      'other'
    )
  }

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Dispensing & payment') + ' — ' + (ticket ? ticket + ' ' : '') + patient.name} onClose={onClose} />
      {err && <div className="warn-banner danger show" style={{ margin: 12 }}>{err}</div>}
      {inv === undefined && !err ? (
        <p className="ai-soft" style={{ padding: 16 }}>Loading…</p>
      ) : (
        <>
          <div className="pay-status-line">
            <span className={'badge ' + (paid ? 'ok' : 'warn')}>{translate(paid ? 'Paid' : 'Awaiting payment')}</span>
            <span className={'badge ' + (waiting.length ? 'warn' : 'ok')}>{waiting.length ? waiting.length + ' ' + translate('drugs to dispense') : translate('Dispensing done')}</span>
          </div>
          <div className="itabs">
            <button className={'itab' + (tab === 'dispense' ? ' active' : '')} onClick={() => setTab('dispense')}>
              <Icon name="box" /> <span>Dispensing</span> {waiting.length > 0 && <span className="itab-cnt">{waiting.length}</span>}
            </button>
            <button className={'itab' + (tab === 'pay' ? ' active' : '')} onClick={() => setTab('pay')}>
              <Icon name="banknote" /> <span>Invoice &amp; payment</span>
            </button>
          </div>

          {tab === 'dispense' && (
            <div className="ipanel active">
              {items.length ? (
                <table className="dt disp-table">
                  <thead>
                    <tr>
                      <th>Drug</th>
                      <th className="num">Quantity</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l) => (
                      <tr key={l.item_id} className={l.dispense_status === 'Skipped' ? 'disp-skipped' : ''}>
                        <td>
                          <b>{l.drug_name}</b>
                          <div className="inv-sub">{[l.dosage, l.frequency, l.duration_days + ' ' + translate('days')].join(' · ')}</div>
                          {l.instruction && <div className="inv-sub">{l.instruction}</div>}
                          {l.skip_reason && (
                            <div className="inv-sub">
                              {translate('Reason')}: {l.skip_reason}
                            </div>
                          )}
                        </td>
                        <td className="num mono">
                          {l.quantity} {translate(unitLabel(l.unit))}
                        </td>
                        <td>
                          <span className={'badge ' + (DS[l.dispense_status]?.cls ?? 'muted')}>{translate(DS[l.dispense_status]?.label ?? l.dispense_status)}</span>
                        </td>
                        <td className="ai-actions">
                          {l.dispense_status === 'Pending' && skipping !== l.item_id && (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={() => markDispensed(l)}>
                                <Icon name="check" /> Dispensed
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={paid}
                                title={paid ? translate('Already paid — only “Dispensed” can be recorded now') : ''}
                                onClick={() => (setSkipping(l.item_id), setSkipReason(''))}
                              >
                                <Icon name="x" /> Skip
                              </button>
                            </>
                          )}
                          {skipping === l.item_id && (
                            <span className="disp-skip">
                              <input type="text" autoFocus placeholder={translate('Reason (e.g. patient declined, out of stock)')} value={skipReason} onChange={(e) => setSkipReason(e.target.value)} />
                              <button className="btn btn-danger btn-sm" disabled={skipReason.trim().length < 3} onClick={confirmSkip}>
                                Skip &amp; return stock
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setSkipping(null)}>
                                Cancel
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="ai-soft" style={{ fontSize: 13.5 }}>No medication to dispense for this visit.</p>
              )}
              <p className="ai-soft" style={{ fontSize: 12.5 }}>
                <Icon name="repeat" /> <span>Stock was already deducted (FEFO) when the doctor confirmed the prescription. “Dispensed” does not deduct again; “Skip” returns the stock to the same batches and re-issues the invoice.</span>
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={printSlip}>
                  <Icon name="printer" /> Print dispensing slip
                </button>
                {waiting.length > 0 && (
                  <button className="btn btn-primary btn-sm" onClick={all}>
                    <Icon name="check" /> Dispense all
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'pay' && !inv && <p className="ai-soft" style={{ padding: 16 }}>No invoice for this visit.</p>}
          {tab === 'pay' && inv && (
            <div className="ipanel active">
              <div className="pay-cols">
                <div>
                  <div className="section-label">Services</div>
                  <div className="invoice-row">
                    <span className="badge info">{translate('Consultation')}</span>
                    <div className="inv-name">
                      {consultLine?.item_name ?? translate('Consultation fee')}
                      {editable && consultServices.length > 1 && (
                        <select className="ai-select" value="" onChange={(e) => changeConsult(e.target.value)} style={{ marginTop: 4 }}>
                          <option value="">{translate('Change consultation service…')}</option>
                          {consultServices.map((s) => (
                            <option key={s.service_id} value={s.service_id}>
                              {s.name} — {fmt(s.price)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {editable ? (
                      <span className="svc-fee">
                        <input type="number" min="0" step="1000" value={fee} onChange={(e) => setFee(e.target.value)} />
                        {Number(fee) !== Number(inv.consultation_fee) && (
                          <button className="btn btn-ghost btn-sm" onClick={saveFee}>
                            Save
                          </button>
                        )}
                      </span>
                    ) : (
                      <div className="inv-price">{fmt(inv.consultation_fee)}</div>
                    )}
                  </div>
                  {ordered.map((x) => {
                    const it = orderItemOf(x)
                    return (
                      <div className="invoice-row" key={x.invoice_item_id}>
                        <span className="badge info">{translate('Ordered by the doctor')}</span>
                        <div className="inv-name">
                          {x.item_name}
                          {x.quantity > 1 && <div className="inv-sub">× {x.quantity}</div>}
                          {editable && it && !it.result && (
                            <div>
                              <button className="btn btn-ghost btn-sm inv-cancel" title={translate('The patient did not have this done — remove it from the invoice')} onClick={() => setCancelLine({ itemId: it.item_id, name: it.item_name })}>
                                Cancel order
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="inv-price">{fmt(x.subtotal)}</div>
                      </div>
                    )
                  })}
                  {unbilled.length > 0 && (
                    <div className="warn-banner show" style={{ margin: '6px 0' }}>
                      <b>{translate('Ordered outside the catalog — no price yet')}:</b>{' '}
                      {unbilled.map((u) => (
                        <button key={u.item_id} className="btn btn-ghost btn-sm" disabled={!editable} onClick={() => setCustom({ name: u.item_name, amount: '' })} title={translate('Add it below with its price')}>
                          + {u.item_name}
                        </button>
                      ))}
                    </div>
                  )}
                  {services.map((x, idx) => (
                    <div className="invoice-row" key={x.invoice_item_id}>
                      <span className="badge muted">{translate('Paraclinical')}</span>
                      <div className="inv-name">
                        {x.item_name}
                        {x.quantity > 1 && <div className="inv-sub">× {x.quantity}</div>}
                      </div>
                      <div className="inv-price">{fmt(x.subtotal)}</div>
                      {editable && (
                        <button className="icon-btn sm danger" title={translate('Remove')} onClick={() => removeService(idx)}>
                          <Icon name="x" />
                        </button>
                      )}
                    </div>
                  ))}
                  {editable && (
                    <div className="svc-add">
                      <select className="ai-select" value={adding} onChange={(e) => addFromCatalog(e.target.value)}>
                        <option value="">{translate('+ Add a service from the catalog…')}</option>
                        <optgroup label={translate('Services')}>
                          {cat.services
                            .filter((x) => x.kind === 'Service' && x.is_active !== false && x.group_key !== 'consult')
                            .map((x) => (
                              <option key={x.service_id} value={x.service_id}>
                                {x.name} — {fmt(x.price)}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label={translate('Lab tests')}>
                          {cat.services
                            .filter((x) => x.kind === 'Lab' && x.is_active !== false && Number(x.price) > 0)
                            .map((x) => (
                              <option key={x.service_id} value={x.service_id}>
                                {x.name} — {fmt(x.price)}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                      <div className="svc-custom">
                        <input type="text" placeholder={translate('Other service, e.g. ultrasound at partner clinic')} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
                        <input type="number" min="0" step="1000" placeholder={translate('Amount')} value={custom.amount} onChange={(e) => setCustom({ ...custom, amount: e.target.value })} />
                        <button className="btn btn-ghost btn-sm" onClick={addCustom}>
                          + {translate('Add')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="section-label">Medication (from the doctor’s prescription)</div>
                  {drugItems.map((x) => (
                    <div className="invoice-row" key={x.invoice_item_id}>
                      <div className="inv-name">
                        {x.item_name}
                        <div className="inv-sub">
                          {x.quantity} × {fmt(x.unit_price)}
                        </div>
                      </div>
                      <div className="inv-price">{fmt(x.subtotal)}</div>
                    </div>
                  ))}
                  {!drugItems.length && <p className="ai-soft" style={{ fontSize: 13 }}>No medication on this invoice.</p>}
                </div>

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
              </div>
            </div>
          )}
        </>
      )}
      {cancelLine && (
        <CancelOrderItemModal
          item={cancelLine}
          onClose={() => setCancelLine(null)}
          onDone={async () => {
            setCancelLine(null)
            await load()
            syncQueue()
            showToast(translate('Order cancelled — the invoice was re-issued'))
          }}
        />
      )}
    </Modal>
  )
}
