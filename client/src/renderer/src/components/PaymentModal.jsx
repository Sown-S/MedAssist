import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import { useToast } from '../context/ToastContext'
import Icon from './Icon'
import Button from './Button'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useAuth } from '../context/AuthContext'
import { useQueue, ST, dispenseItem, dispenseAll, setServiceLines, payVisit, cancelPrescribedVisit, ensureInvoice, pendingDispense } from '../api/queueStore'
import { useInvoices, invoiceById, itemType } from '../api/invoiceStore'
import { useCatalogs } from '../api/catalogStore'
import { outsideLines } from '../api/billing'
import { unitLabel, printHtml, esc } from '../pages/admin/inventory/shared'
import { getSettings, PAYMENT_METHODS } from '../api/settingsStore'
import { printReceipt } from './queuePrint'
import { translate } from '../i18n'
import { dmy } from '../pages/reception/shared'

// CẤP PHÁT & THU TIỀN cho một lượt đã chốt đơn (Prescribed) — đúng luồng backend lượt 6c:
//  - Kho đã trừ lúc bác sĩ chốt đơn (FEFO, lô còn hạn qua hết đợt) → ở đây chỉ GHI NHẬN cấp phát từng dòng:
//    "Đã cấp" (không trừ lần nữa) hoặc "Bỏ qua" (bắt buộc lý do → hoàn kho đúng lô + lập lại hoá đơn);
//  - Hoá đơn pending đã tự tạo (phí khám + thuốc). Lễ tân thêm / bỏ dòng dịch vụ (khám, cận lâm sàng: siêu âm, xét nghiệm…);
//  - Thu tiền: Tiền mặt | Chuyển khoản. Đã thu tiền VÀ cấp phát xong → lượt Hoàn tất (Finished).
// Không có giảm giá, BHYT, làm tròn hay thêm thuốc theo đơn giấy (ngoài phạm vi; CSDL ràng buộc tổng = tổng các dòng).
const fmt = (n) => Math.max(n, 0).toLocaleString('vi-VN') + 'đ'
const DS = {
  Pending: { label: 'Waiting to dispense', cls: 'warn' },
  Dispensed: { label: 'Dispensed', cls: 'ok' },
  Skipped: { label: 'Skipped', cls: 'muted' }
}
// Loại dòng dịch vụ: nhóm 'consult' của danh mục Dịch vụ = Khám; còn lại (thủ thuật, tiêm, chẩn đoán hình ảnh, xét nghiệm) = Cận lâm sàng.
const typeOfService = (group) => (group === 'consult' ? 'Consultation' : 'Paraclinical')

export default function PaymentModal({ open, onClose, patient, initialTab = 'dispense' }) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const { visits } = useQueue()
  useInvoices()
  const cats = useCatalogs()
  const v = visits.find((x) => x.id === patient?.id) ?? patient
  // Lượt Prescribed từ dữ liệu cũ chưa có hoá đơn → tạo hoá đơn pending ngay khi mở.
  useEffect(() => {
    if (v?.status === ST.PRESCRIBED) ensureInvoice(v.id, user)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const inv = v?.invoiceId ? invoiceById(v.invoiceId) : null
  const [tab, setTab] = useState(initialTab === 'pay' ? 'pay' : initialTab === 'rx' ? 'dispense' : initialTab)
  const [skipping, setSkipping] = useState(null) // chỉ số dòng đang nhập lý do bỏ qua
  const [skipReason, setSkipReason] = useState('')
  const [adding, setAdding] = useState('')
  const [custom, setCustom] = useState({ item_type: 'Paraclinical', name: '', amount: '' })
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const methods = PAYMENT_METHODS.filter((m) => ['cash', 'transfer'].includes(m.key) && getSettings().ops.methods.includes(m.key))
  const [method, setMethod] = useState(inv?.method ?? methods[0]?.key ?? 'cash')
  const [transferRef, setTransferRef] = useState(inv?.ref ?? '')
  const [pay, paying] = useAsyncAction(doPay)

  if (!v) return null
  const editable = v.status === ST.PRESCRIBED && inv?.status === 'pending'
  const lines = (v.rx ?? []).map((l, i) => ({ ...l, i })).filter((l) => l.dispense_status !== 'Outside')
  const waitingLines = pendingDispense(v)
  const services = (inv?.items ?? []).filter((x) => itemType(x) !== 'Drug')
  const drugItems = (inv?.items ?? []).filter((x) => itemType(x) === 'Drug')

  // ---------- Cấp phát ----------
  function markDispensed(i) {
    const r = dispenseItem(v.id, i, { status: 'Dispensed' }, user)
    if (!r.ok) return showToast(translate(r.error))
  }
  function confirmSkip() {
    const r = dispenseItem(v.id, skipping, { status: 'Skipped', reason: skipReason }, user)
    if (!r.ok) return showToast(translate(r.error))
    setSkipping(null)
    setSkipReason('')
    showToast('Skipped — stock returned and the invoice re-issued')
  }
  function all() {
    dispenseAll(v.id, user)
    showToast('All drugs recorded as dispensed')
  }

  // ---------- Dòng dịch vụ ----------
  const saveServices = (next) => {
    const r = setServiceLines(v.id, next, user)
    if (!r.ok) showToast(translate(r.error))
  }
  const asService = (x) => ({ item_type: itemType(x), name: x.name, amount: x.amount, code: x.code, auto: x.auto })
  function addFromCatalog(key) {
    setAdding('')
    if (!key) return
    const [kind, code] = key.split(':')
    const row = (kind === 'svc' ? cats.services : cats.labs).find((x) => x.code === code)
    if (!row) return
    saveServices([...services.map(asService), { item_type: kind === 'svc' ? typeOfService(row.group) : 'Paraclinical', name: row.name, amount: row.price ?? 0, code: row.code }])
  }
  function addOrderedTests() {
    const ordered = (v.labOrders ?? []).flatMap((o) => o.tests).map((t) => cats.labs.find((x) => x.code === t.code)).filter((x) => x && x.price > 0)
    const fresh = ordered.filter((x) => !services.some((s) => s.code === x.code))
    if (!fresh.length) return showToast(translate('No priced lab tests to add — they are already on the invoice, or have no price in the catalog.'))
    saveServices([...services.map(asService), ...fresh.map((x) => ({ item_type: 'Paraclinical', name: x.name, amount: x.price, code: x.code }))])
  }
  function addCustom() {
    if (!custom.name.trim() || !(Number(custom.amount) >= 0) || custom.amount === '') return showToast(translate('Each service line needs a name and an amount.'))
    saveServices([...services.map(asService), { item_type: custom.item_type, name: custom.name.trim(), amount: Number(custom.amount) }])
    setCustom({ item_type: 'Paraclinical', name: '', amount: '' })
  }
  const removeService = (idx) => saveServices(services.filter((_, j) => j !== idx).map(asService))

  // ---------- Thu tiền ----------
  function doPay(waiting) {
    const r = payVisit(v.id, { method, ref: transferRef.trim(), waiting }, user)
    if (!r.ok) return showToast(translate(r.error))
    if (waiting) return showToast('Saved — waiting for the transfer; confirm it later in Invoices')
    const paid = invoiceById(inv.id)
    printReceipt(paid)
    showToast(waitingLines.length ? 'Payment collected — finish dispensing to complete the visit' : 'Payment collected — visit completed')
  }
  function cancelVisitHere() {
    const r = cancelPrescribedVisit(v.id, cancelReason, user)
    if (!r.ok) return showToast(translate(r.error))
    showToast('Visit cancelled — undispensed stock returned')
    onClose()
  }

  // Phiếu xuất thuốc (không có giá) — kèm số lô, hạn dùng đã trừ lúc chốt đơn.
  function printSlip() {
    const t = translate
    const rows = lines
      .filter((l) => l.dispense_status !== 'Skipped')
      .map(
        (l, n) =>
          `<tr><td>${n + 1}</td><td><b>${esc(l.name)}</b>${l.usage ? `<br><small>${esc(t(l.usage))}</small>` : ''}${
            l.alloc?.length ? `<br><small>${esc(t('Lot'))} ${l.alloc.map((a) => esc(a.lot) + ' (' + esc(dmy(a.expiry + 'T12:00:00')) + ') ×' + a.qty).join(', ')}</small>` : ''
          }</td><td class="num">${esc(l.qty)} ${esc(t(unitLabel(l.unit)))}</td></tr>`
      )
      .join('')
    if (!rows) return showToast(translate('No drugs to dispense on this invoice.'))
    printHtml(
      t('Dispensing slip'),
      `<h1>${esc(t('Dispensing slip'))}</h1>
      <p class="meta">${esc(t('Patient'))}: <b>${esc(v.name)}</b> · ${esc(t('no.'))} ${esc(String(v.ticket).padStart(3, '0'))}</p>
      <p class="meta">${esc(t('Doctor'))}: ${esc(v.doctor || '—')} · ${new Date().toLocaleString('vi-VN')} · ${esc(user.name)}</p>
      ${v.allergies ? `<p class="meta">${esc(t('Drug allergy'))}: <b>${esc(t(v.allergies))}</b></p>` : ''}
      <table><thead><tr><th>#</th><th>${esc(t('Drug'))}</th><th class="num">${esc(t('Quantity'))}</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sign"><div>${esc(t('Dispensed by'))}<i>(${esc(t('Signature, full name'))})</i></div><div></div><div>${esc(t('Patient received'))}<i>(${esc(t('Signature, full name'))})</i></div></div>`,
      'other'
    )
  }

  const outside = outsideLines(v)
  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHeader title={translate('Dispensing & payment') + ' — ' + String(v.ticket).padStart(3, '0') + ' ' + v.name} onClose={onClose} />
      <div className="pay-status-line">
        <span>
          {translate('Doctor')}: <b>{v.doctor || '—'}</b>
          {v.diagnosis ? ' · ' + v.diagnosis : ''}
        </span>
        <span className={'badge ' + (inv?.status === 'paid' ? 'ok' : 'warn')}>{translate(inv?.status === 'paid' ? 'Paid' : 'Awaiting payment')}</span>
        <span className={'badge ' + (waitingLines.length ? 'warn' : 'ok')}>
          {waitingLines.length ? waitingLines.length + ' ' + translate('drugs to dispense') : translate('Dispensing done')}
        </span>
        {v.status === ST.FINISHED && <span className="badge ok">{translate('Completed')}</span>}
      </div>
      <div className="itabs">
        <button className={'itab' + (tab === 'dispense' ? ' active' : '')} onClick={() => setTab('dispense')}>
          <Icon name="box" /> <span>Dispensing</span> {waitingLines.length > 0 && <span className="itab-cnt">{waitingLines.length}</span>}
        </button>
        <button className={'itab' + (tab === 'pay' ? ' active' : '')} onClick={() => setTab('pay')}>
          <Icon name="banknote" /> <span>Invoice &amp; payment</span>
        </button>
      </div>

      {tab === 'dispense' && (
        <div className="ipanel active">
          {outside.length > 0 && (
            <div className="warn-banner show caution" style={{ margin: '8px 0' }}>
              <div className="icon">
                <Icon name="alert" />
              </div>
              <div className="txt">
                <b>Bought at an outside pharmacy — not dispensed here</b>
                {outside.map((l) => l.name + ' × ' + l.qty).join(', ')} — <span>controlled drug (N/H) on its own prescription; this pharmacy does not sell it.</span>
              </div>
            </div>
          )}
          {lines.length ? (
            <table className="dt disp-table">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th className="num">Quantity</th>
                  <th>Batch (expiry)</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.i} className={l.dispense_status === 'Skipped' ? 'disp-skipped' : ''}>
                    <td>
                      <b>{l.name}</b>
                      {l.usage && <div className="inv-sub">{translate(l.usage)}</div>}
                      {l.skip_reason && <div className="inv-sub">{translate('Reason')}: {l.skip_reason}</div>}
                    </td>
                    <td className="num mono">
                      {l.qty} {translate(unitLabel(l.unit))}
                    </td>
                    <td className="mono ai-small">{l.alloc?.length ? l.alloc.map((a) => `${a.lot} (${dmy(a.expiry + 'T12:00:00')}) ×${a.qty}`).join(', ') : '—'}</td>
                    <td>
                      <span className={'badge ' + (DS[l.dispense_status]?.cls ?? 'muted')}>{translate(DS[l.dispense_status]?.label ?? l.dispense_status ?? '—')}</span>
                      {l.dispensed_by && <div className="inv-sub">{l.dispensed_by}</div>}
                    </td>
                    <td className="ai-actions">
                      {l.dispense_status === 'Pending' && v.status === ST.PRESCRIBED && skipping !== l.i && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => markDispensed(l.i)}>
                            <Icon name="check" /> Dispensed
                          </button>
                          <button className="btn btn-ghost btn-sm" disabled={inv?.status === 'paid'} title={inv?.status === 'paid' ? translate('Already paid — an administrator must cancel the invoice first') : ''} onClick={() => (setSkipping(l.i), setSkipReason(''))}>
                            <Icon name="x" /> Skip
                          </button>
                        </>
                      )}
                      {skipping === l.i && (
                        <span className="disp-skip">
                          <input type="text" autoFocus placeholder={translate('Reason (e.g. patient declined, out of stock)')} value={skipReason} onChange={(e) => setSkipReason(e.target.value)} />
                          <button className="btn btn-danger btn-sm" disabled={!skipReason.trim()} onClick={confirmSkip}>
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
            {waitingLines.length > 0 && v.status === ST.PRESCRIBED && (
              <button className="btn btn-primary btn-sm" onClick={all}>
                <Icon name="check" /> Dispense all
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'pay' && inv && (
        <div className="ipanel active">
          <div className="pay-cols">
            <div>
              <div className="section-label">Services</div>
              {services.map((x, idx) => (
                <div className="invoice-row" key={'s' + idx}>
                  <span className={'badge ' + (itemType(x) === 'Consultation' ? 'info' : 'muted')}>{translate(itemType(x) === 'Consultation' ? 'Consultation' : 'Paraclinical')}</span>
                  <div className="inv-name">{translate(x.name)}</div>
                  <div className="inv-price">{fmt(x.amount)}</div>
                  {editable && (
                    <button className="icon-btn sm danger" title={translate('Remove')} onClick={() => removeService(idx)}>
                      <Icon name="x" />
                    </button>
                  )}
                </div>
              ))}
              {!services.length && <p className="ai-soft" style={{ fontSize: 13 }}>No service lines.</p>}
              {editable && (
                <div className="svc-add">
                  <select className="ai-select" value={adding} onChange={(e) => addFromCatalog(e.target.value)}>
                    <option value="">{translate('+ Add a service from the catalog…')}</option>
                    <optgroup label={translate('Services')}>
                      {cats.services
                        .filter((x) => x.active !== false)
                        .map((x) => (
                          <option key={x.code} value={'svc:' + x.code}>
                            {x.name} — {fmt(x.price ?? 0)}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label={translate('Lab tests')}>
                      {cats.labs
                        .filter((x) => x.active !== false && x.price > 0)
                        .map((x) => (
                          <option key={x.code} value={'lab:' + x.code}>
                            {x.name} — {fmt(x.price)}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  {(v.labOrders ?? []).length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={addOrderedTests}>
                      <Icon name="flask" /> Add the ordered lab tests
                    </button>
                  )}
                  <div className="svc-custom">
                    <select className="ai-select" value={custom.item_type} onChange={(e) => setCustom({ ...custom, item_type: e.target.value })}>
                      <option value="Paraclinical">{translate('Paraclinical')}</option>
                      <option value="Consultation">{translate('Consultation')}</option>
                    </select>
                    <input type="text" placeholder={translate('Other service, e.g. ultrasound at partner clinic')} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
                    <input type="number" min="0" step="1000" placeholder={translate('Amount')} value={custom.amount} onChange={(e) => setCustom({ ...custom, amount: e.target.value })} />
                    <button className="btn btn-ghost btn-sm" onClick={addCustom}>
                      + {translate('Add')}
                    </button>
                  </div>
                </div>
              )}

              <div className="section-label">Medication (from the doctor’s prescription)</div>
              {drugItems.map((x, idx) => (
                <div className="invoice-row" key={'d' + idx}>
                  <div className="inv-name">
                    {x.name}
                    <div className="inv-sub">
                      {x.qty} × {fmt(x.unit_price ?? x.amount / (x.qty || 1))}
                    </div>
                  </div>
                  <div className="inv-price">{fmt(x.amount)}</div>
                </div>
              ))}
              {!drugItems.length && <p className="ai-soft" style={{ fontSize: 13 }}>No medication on this invoice.</p>}
            </div>

            <div>
              <div className="sum-line">
                <span>Consultation</span>
                <span>{fmt(inv.consultation_fee ?? 0)}</span>
              </div>
              <div className="sum-line">
                <span>Paraclinical</span>
                <span>{fmt(inv.paraclinical_fee ?? 0)}</span>
              </div>
              <div className="sum-line">
                <span>Medication</span>
                <span>{fmt(inv.drug_fee ?? 0)}</span>
              </div>
              <div className="sum-total">
                <span>Total</span>
                <span className="amt">{fmt(inv.total)}</span>
              </div>
              <p className="ai-soft mono" style={{ fontSize: 12 }}>
                {inv.id} · {translate(inv.status === 'paid' ? 'Paid' : 'Awaiting payment')}
              </p>

              {inv.status === 'paid' ? (
                <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => printReceipt(inv)}>
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
                    <div className="field" style={{ marginTop: 10 }}>
                      <label>Transfer reference (optional)</label>
                      <input type="text" value={transferRef} onChange={(e) => setTransferRef(e.target.value)} placeholder="FT26…" />
                      <span className="ai-soft" style={{ fontSize: 12.5 }}>
                        Check that the transfer has arrived in the clinic’s bank account before confirming. If it has not arrived yet, save it as “waiting for transfer” and confirm it later in Invoices.
                      </span>
                    </div>
                  )}
                  <Button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={paying || !editable} onClick={() => pay(false)}>
                    {method === 'transfer' ? 'Transfer received — collect' : 'Collect payment'}
                  </Button>
                  {method === 'transfer' && (
                    <Button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} disabled={paying || !editable} onClick={() => pay(true)}>
                      <Icon name="clock" /> Waiting for transfer
                    </Button>
                  )}
                  {!cancelling ? (
                    <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} disabled={!editable || lines.some((l) => l.dispense_status === 'Dispensed')} onClick={() => setCancelling(true)} title={translate('The patient left without paying or taking the medication')}>
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
                        <button className="btn btn-danger btn-sm" disabled={!cancelReason.trim()} onClick={cancelVisitHere}>
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
    </Modal>
  )
}
