import { useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import Button from '../../components/Button'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useQueue, payStatusOf, confirmVisitPayment, voidInvoice, ST } from '../../api/queueStore'
import { useInvoices, dayOf, activeInvoiceOf } from '../../api/invoiceStore'
import { estimateTotal } from '../../api/billing'
import { fold } from '../../api/patientStore'
import { printReceipt, ticketNo } from '../../components/queuePrint'
import { fmt, hhmm, dmy, ymd, methodLabel, periodRange, inRange, periodLabel, PAY_STATUS } from './shared'
import PeriodPicker from './PeriodPicker'
import { PAYMENT_METHODS, getSettings } from '../../api/settingsStore'
import { printHtml, esc } from '../admin/inventory/shared'
import { useInventory, dispensedFor, returnDispensed } from '../../api/inventoryStore'
import { verifyLogin } from '../../api/accountStore'

const URGENT = { unpaid: 0, processing: 1, paid: 2, cancelled: 2 }

const TABS = [
  { key: '', label: 'All' },
  { key: 'unpaid', label: 'Not paid' },
  { key: 'processing', label: 'Waiting for transfer' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' }
]

const METHOD_ICON = { cash: 'banknote', transfer: 'repeat', card: 'card', ewallet: 'wallet' }
const REV_CARDS = [
  { key: 'today', label: 'Collected today', icon: 'calendar', tone: 'green' },
  { key: 'week', label: 'This week', icon: 'trending', tone: 'cyan' },
  { key: 'month', label: 'This month', icon: 'chart', tone: 'violet' },
  { key: 'all', label: 'All time', icon: 'banknote', tone: 'amber' }
]
const SORTS = [
  { key: 'urgent', label: 'To-do first' },
  { key: 'new', label: 'Newest first' },
  { key: 'old', label: 'Oldest first' },
  { key: 'amount', label: 'Highest amount' }
]

// Doanh thu = hoá đơn ĐÃ THU (không tính hoá đơn huỷ), tính theo ngày thu tiền.
const collectedIn = (invoices, range) => invoices.filter((x) => x.status === 'paid' && inRange(dayOf(x.paidAt ?? x.createdAt), range))
const sumOf = (list) => list.reduce((s, x) => s + x.total, 0)

// Hoá đơn & thanh toán: doanh thu theo ngày / tuần / tháng, ai đã thanh toán, ai đang chờ tiền chuyển khoản, ai chưa thanh toán.
// canCollect = false: Quản trị viên xem cùng dữ liệu nhưng không thu tiền / xác nhận chuyển khoản (việc của lễ tân).
export default function InvoicesView({ readOnly, canVoid, onPay, onNew, initialStatus = '', canCollect = true }) {
  const { user } = useAuth()
  const { visits } = useQueue()
  const invoices = useInvoices()
  const [status, setStatus] = useState(initialStatus)
  const [period, setPeriod] = useState('today')
  const [date, setDate] = useState('')
  const [sort, setSort] = useState('urgent')
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  const today = ymd(new Date())
  const range = periodRange(period, date)
  const setRange = (p, d = '') => {
    setPeriod(p)
    setDate(d)
  }

  // Hoá đơn tự tạo ở trạng thái pending khi bác sĩ chốt đơn; chỉ lượt cũ (dữ liệu trước đây) mới có thể chưa có hoá đơn.
  const unpaid = inRange(today, range)
    ? visits
        .filter((v) => v.status === ST.PRESCRIBED && !activeInvoiceOf(v.id))
        .map((v) => ({ key: v.id, status: 'unpaid', visit: v, name: v.name, phone: v.phone, patientId: v.patientId, ticket: v.ticket, amount: estimateTotal(v), at: v.statusAt, doctor: v.doctor }))
    : []
  const rows = [
    ...unpaid,
    ...invoices
      .filter((x) => inRange(dayOf(x.createdAt), range))
      // pending = "Chưa thanh toán" (hoặc "Chờ chuyển khoản" khi đã chọn hình thức chuyển khoản mà tiền chưa về).
      .map((x) => ({ key: x.id, status: x.status === 'pending' ? (x.method === 'transfer' ? 'processing' : 'unpaid') : x.status, visit: x.status === 'pending' ? visits.find((v) => v.id === x.visitId) : null, invoice: x, name: x.name, phone: x.phone, patientId: x.patientId, ticket: x.ticket, amount: x.total, at: x.paidAt ?? x.createdAt, doctor: x.doctor }))
  ]
  const byStatus = (s) => rows.filter((r) => r.status === s)
  const needle = fold(q)
  const shown = rows
    .filter((r) => (!status || r.status === status) && (!needle || fold([r.name, r.phone, r.patientId, r.invoice?.id].join(' ')).includes(needle)))
    .sort((a, b) =>
      sort === 'new'
        ? b.at.localeCompare(a.at)
        : sort === 'old'
          ? a.at.localeCompare(b.at)
          : sort === 'amount'
            ? b.amount - a.amount
            : // Việc cần làm lên đầu: chưa thanh toán, rồi đang chờ chuyển khoản; còn lại mới nhất trước.
              URGENT[a.status] - URGENT[b.status] || b.at.localeCompare(a.at)
    )

  const collected = collectedIn(invoices, range)
  const total = sumOf(collected)
  const methods = PAYMENT_METHODS.map((m) => {
    const list = collected.filter((x) => x.method === m.key)
    return { ...m, count: list.length, amount: sumOf(list) }
  }).filter((m) => m.count || getSettings().ops.methods.includes(m.key))

  function printReport() {
    const t = translate
    const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0) + '%'
    const stRows = TABS.slice(1)
      .map((s) => {
        const list = byStatus(s.key)
        return `<tr><td>${esc(t(s.label))}</td><td class="num">${list.length}</td><td class="num">${fmt(list.reduce((a, r) => a + r.amount, 0))}</td></tr>`
      })
      .join('')
    const mRows = methods.map((m) => `<tr><td>${esc(t(m.label))}</td><td class="num">${m.count}</td><td class="num">${fmt(m.amount)}</td><td class="num">${pct(m.amount)}</td></tr>`).join('')
    const list = [...rows]
      .sort((a, b) => a.at.localeCompare(b.at))
      .map(
        (r) =>
          `<tr><td>${esc(r.invoice?.id ?? t('Not issued yet'))}</td><td>${esc(dmy(r.at) + ' ' + hhmm(r.at))}</td><td>${esc(r.name)}</td><td>${esc(
            r.invoice ? t(methodLabel(r.invoice.method)) : '—'
          )}</td><td>${esc(t(PAY_STATUS[r.status].label))}</td><td class="num">${fmt(r.amount)}</td></tr>`
      )
      .join('')
    printHtml(
      t('Payment report'),
      `<h1>${esc(t('Payment report'))} — ${esc(t(periodLabel(period, date)))}</h1>
      <p class="meta">${period === 'all' ? '' : esc(dmy(range[0] + 'T00:00:00') + ' – ' + dmy(range[1] + 'T00:00:00')) + ' · '}${esc(t('Printed by'))}: ${esc(user.name)} · ${esc(dmy(new Date().toISOString()) + ' ' + hhmm(new Date().toISOString()))}</p>
      <p class="meta">${esc(t('Revenue collected'))}: <b>${fmt(total)}</b> · ${esc(t('Invoices paid'))}: <b>${collected.length}</b></p>
      <h2>${esc(t('By payment status'))}</h2>
      <table><thead><tr><th>${esc(t('Status'))}</th><th class="num">${esc(t('Count'))}</th><th class="num">${esc(t('Amount'))}</th></tr></thead><tbody>${stRows}</tbody></table>
      <h2>${esc(t('By payment method'))}</h2>
      <table><thead><tr><th>${esc(t('Method'))}</th><th class="num">${esc(t('Count'))}</th><th class="num">${esc(t('Amount'))}</th><th class="num">%</th></tr></thead><tbody>${mRows}</tbody></table>
      <h2>${esc(t('Invoices'))}</h2>
      <table><thead><tr><th>${esc(t('Invoice'))}</th><th>${esc(t('Time'))}</th><th>${esc(t('Patient'))}</th><th>${esc(t('Method'))}</th><th>${esc(t('Status'))}</th><th class="num">${esc(
        t('Amount')
      )}</th></tr></thead><tbody>${list}</tbody></table>`,
      'other'
    )
  }

  return (
    <>
      <div className="rev-cards">
        {REV_CARDS.map((c) => {
          const list = collectedIn(invoices, periodRange(c.key))
          return (
            <button key={c.key} className={'rev-card ' + c.tone + (period === c.key ? ' active' : '')} onClick={() => setRange(c.key)}>
              <span className="head">
                <span className="ico">
                  <Icon name={c.icon} />
                </span>
                {c.label}
              </span>
              <span className="val">{fmt(sumOf(list))}</span>
              <span className="sub">
                {list.length} {translate('invoices paid')}
              </span>
            </button>
          )
        })}
      </div>

      <div className="inv-overview">
        <div className="card">
          <div className="card-title">
            <Icon name="banknote" /> <span>Revenue by payment method</span>
            <span className="cnt">{translate(periodLabel(period, date))}</span>
          </div>
          {methods.map((m) => {
            const pct = total ? Math.round((m.amount / total) * 100) : 0
            return (
              <div className="meter-row" key={m.key}>
                <span className="ico">
                  <Icon name={METHOD_ICON[m.key] ?? 'banknote'} />
                </span>
                <div className="meter-main">
                  <div className="meter-top">
                    <b>{m.label}</b>
                    <span className="mono">{fmt(m.amount)}</span>
                  </div>
                  <div className="meter">
                    <span style={{ width: pct + '%' }} />
                  </div>
                  <div className="meter-sub">
                    <span>
                      {m.count} {translate('transactions')}
                    </span>
                    <span>{pct}%</span>
                  </div>
                </div>
              </div>
            )
          })}
          <div className="sum-total" style={{ marginTop: 8 }}>
            <span>Revenue collected</span>
            <span className="amt">{fmt(total)}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <Icon name="clock" /> <span>Payment status</span>
            <span className="cnt">{translate(periodLabel(period, date))}</span>
          </div>
          {TABS.slice(1).map((t) => {
            const list = byStatus(t.key)
            return (
              <button key={t.key} className={'status-row ' + t.key + (status === t.key ? ' active' : '')} onClick={() => setStatus(status === t.key ? '' : t.key)}>
                <span className="dot" />
                <span className="grow">
                  <b>{t.label}</b>
                  <small>
                    {list.length} {translate(list.length === 1 ? 'invoice' : 'invoices')}
                  </small>
                </span>
                <span className="mono">{fmt(list.reduce((s, r) => s + r.amount, 0))}</span>
              </button>
            )
          })}
          <p className="ai-soft" style={{ fontSize: 12, margin: '8px 0 0' }}>
            “Not paid” only counts today’s visits that are waiting for payment (estimated amount).
          </p>
        </div>
      </div>

      <div className="card">
        <div className="cash-filters">
          <PeriodPicker period={period} date={date} onChange={setRange} />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <input className="grow" type="search" placeholder="Search patient, phone, invoice no…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={printReport}>
            <Icon name="printer" /> Print report
          </button>
          {onNew && (
            <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={onNew}>
              + New invoice
            </button>
          )}
        </div>
        <div className="itabs" style={{ marginBottom: 6 }}>
          {TABS.map((t) => (
            <button key={t.key} className={'itab' + (status === t.key ? ' active' : '')} onClick={() => setStatus(t.key)}>
              {t.label}
              {t.key && <span className="itab-cnt">{byStatus(t.key).length}</span>}
            </button>
          ))}
        </div>
        <table className="dt">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Patient</th>
              <th className="num">Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="clickable" onClick={() => (r.invoice ? setDetail(r.invoice) : null)}>
                <td className="mono">{r.invoice ? r.invoice.id : <span className="ai-soft">{translate('Not issued yet')}</span>}</td>
                <td>
                  <b>{r.name}</b>
                  <div className="ai-soft" style={{ fontSize: 12 }}>
                    {r.ticket ? translate('no.') + ' ' + ticketNo(r.ticket) + ' · ' : ''}
                    <span className="mono">{r.phone}</span>
                  </div>
                </td>
                <td className="num mono">
                  {fmt(r.amount)}
                  {r.status === 'unpaid' && <div className="ai-soft" style={{ fontSize: 11 }}>{translate('estimated')}</div>}
                </td>
                <td>{r.invoice ? translate(methodLabel(r.invoice.method)) : '—'}</td>
                <td>
                  <span className={'badge ' + PAY_STATUS[r.status].cls}>{PAY_STATUS[r.status].label}</span>
                </td>
                <td className="mono">
                  {dayOf(r.at) === today ? hhmm(r.at) : dmy(r.at) + ' ' + hhmm(r.at)}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="row-actions">
                    {r.status === 'unpaid' && canCollect && onPay && r.visit && (
                      <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => onPay(r.visit)}>
                        Collect payment
                      </button>
                    )}
                    {r.status === 'processing' && canCollect && (
                      <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => setConfirming(r.invoice)}>
                        <Icon name="check" /> Transfer received
                      </button>
                    )}
                    {r.invoice && (
                      <button className="icon-btn sm" title={translate('View invoice')} onClick={() => setDetail(r.invoice)}>
                        <Icon name="eye" />
                      </button>
                    )}
                    {r.status === 'paid' && (
                      <button className="icon-btn sm" title={translate('Reprint receipt')} onClick={() => printReceipt(r.invoice)}>
                        <Icon name="printer" />
                      </button>
                    )}
                    {canVoid && r.status === 'paid' && (
                      <button className="icon-btn sm danger" title={translate('Cancel invoice')} disabled={readOnly} onClick={() => setCancelling(r.invoice)}>
                        <Icon name="ban" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">
                    <Icon name="folder" />
                    <b>No invoices match.</b>
                    <span>Try another period or clear the filters.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && <InvoiceDetail inv={detail} onClose={() => setDetail(null)} />}
      {confirming && <ConfirmTransfer inv={confirming} user={user} onClose={() => setConfirming(null)} />}
      {cancelling && <CancelInvoice inv={cancelling} user={user} onClose={() => setCancelling(null)} />}
    </>
  )
}

export function InvoiceDetail({ inv, onClose }) {
  return (
    <Modal open onClose={onClose}>
      <ModalHeader title={translate('Invoice') + ' ' + inv.id} onClose={onClose} />
      <div className="pl-summary">
        <b style={{ color: 'var(--ink)' }}>{inv.name}</b>
        <span className="mono">{inv.patientId}</span>
        <span className="mono">{inv.phone}</span>
        {inv.ticket && (
          <span>
            {translate('no.')} {ticketNo(inv.ticket)}
          </span>
        )}
        {inv.doctor && <span>{inv.doctor}</span>}
      </div>
      <table className="dt" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>Line item</th>
            <th className="num">Quantity</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i}>
              <td>{translate(it.name)}</td>
              <td className="num">{it.qty}</td>
              <td className="num mono">{fmt(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sum-total">
        <span>Total</span>
        <span className="amt">{fmt(inv.total)}</span>
      </div>
      <div className="inv-meta">
        <span>
          <span className={'badge ' + PAY_STATUS[inv.status].cls}>{PAY_STATUS[inv.status].label}</span>
        </span>
        <span>
          {translate('Method')}: {translate(methodLabel(inv.method))}
          {inv.ref ? ' · ' + inv.ref : ''}
        </span>
        <span>
          {translate('Issued')}: {dmy(inv.createdAt)} {hhmm(inv.createdAt)}
        </span>
        {inv.paidAt && (
          <span>
            {translate('Paid at')}: {dmy(inv.paidAt)} {hhmm(inv.paidAt)} · {inv.byName}
          </span>
        )}
        {inv.cancel && (
          <span style={{ color: '#FCA5A5' }}>
            {translate('Cancelled by')} {inv.cancel.by} · {dmy(inv.cancel.at)} {hhmm(inv.cancel.at)} — {inv.cancel.reason}
            {inv.cancel.approvedBy ? ' · ' + translate('Approved by') + ' ' + inv.cancel.approvedBy : ''}
            {inv.cancel.restocked ? ' · ' + translate('drugs returned to stock') : ''}
          </span>
        )}
      </div>
      <div className="form-actions">
        {inv.status === 'paid' && (
          <button className="btn btn-ghost" onClick={() => printReceipt(inv)}>
            <Icon name="printer" /> Reprint receipt
          </button>
        )}
        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

function ConfirmTransfer({ inv, user, onClose }) {
  const { showToast } = useToast()
  const [ref, setRef] = useState(inv.ref)
  function submit() {
    const r = confirmVisitPayment(inv.id, ref, user)
    if (!r.ok) return showToast(r.error)
    printReceipt(r.invoice)
    onClose()
    showToast('Payment completed — receipt sent to the printer')
  }
  return (
    <Modal open onClose={onClose}>
      <ModalHeader title={translate('Transfer received') + ' — ' + inv.id} onClose={onClose} />
      <p className="ai-soft" style={{ fontSize: 13.5, marginTop: 0 }}>
        {inv.name} · {fmt(inv.total)}. {translate('Confirm only after you see the money in the clinic’s bank account.')}
      </p>
      <div className="field">
        <label>Transfer reference (optional)</label>
        <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="FT26…" />
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Back
        </button>
        <button className="btn btn-primary" onClick={submit}>
          <Icon name="check" /> Confirm &amp; print receipt
        </button>
      </div>
    </Modal>
  )
}

// Huỷ hoá đơn. Hoá đơn ĐÃ THU: Quản trị viên phải xác nhận tại quầy (nhập tài khoản + mật khẩu), tránh thu tiền rồi tự huỷ.
// Hoá đơn đang chờ chuyển khoản: lễ tân tự huỷ được. Có thuốc đã xuất → hỏi bệnh nhân đã trả lại thuốc chưa để hoàn kho.
function CancelInvoice({ inv, user, onClose }) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(false)
  const [au, setAu] = useState('')
  const [ap, setAp] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const needAdmin = inv.status === 'paid' && user.roleKey !== 'admin'
  const stock = useInventory()
  const drugs = dispensedFor(inv.id)
  const drugNames = drugs.map((l) => (stock.drugs.find((d) => d.id === l.drugId)?.name ?? l.drugId) + ' ×' + l.qty).join(', ')

  async function submit() {
    setErr('')
    let approvedBy = null
    if (needAdmin) {
      setBusy(true)
      const a = await verifyLogin(au, ap, 'admin')
      setBusy(false)
      if (!a.ok) return setErr(a.error === 'This account does not belong to the selected role.' ? 'Only an administrator account can confirm this.' : a.error)
      approvedBy = a.account.fullName
    }
    const r = voidInvoice(inv.id, reason, user, { approvedBy, restock })
    if (!r.ok) return setErr(r.error)
    if (restock) returnDispensed(inv.id, user)
    onClose()
    showToast(restock ? 'Invoice cancelled and drugs returned to stock' : 'Invoice cancelled — the patient is back in Awaiting payment')
  }
  return (
    <Modal open onClose={onClose}>
      <ModalHeader title={translate('Cancel invoice') + ' ' + inv.id + ' — ' + inv.name} onClose={onClose} />
      <p className="ai-soft" style={{ fontSize: 13.5, marginTop: 0 }}>
        The invoice is kept and marked as cancelled, and the reason is written to the activity log. The patient goes back to “Awaiting payment” so a
        corrected invoice can be issued.
      </p>
      <div className="field">
        <label>Reason</label>
        <textarea rows="3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong amount, wrong payment method…" />
      </div>
      {drugs.length > 0 && (
        <label className="void-restock">
          <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          <span>
            <b>{translate('The patient returned the drugs — put them back into stock')}</b>
            <small>{drugNames}</small>
          </span>
        </label>
      )}
      {needAdmin && (
        <div className="void-approve">
          <div className="section-label">Administrator confirmation (paid invoice)</div>
          <div className="form-grid cols-2">
            <div className="field">
              <label>Administrator username</label>
              <input type="text" value={au} onChange={(e) => setAu(e.target.value)} autoComplete="off" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={ap} onChange={(e) => setAp(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
        </div>
      )}
      {err && <div className="login-err show">{translate(err)}</div>}
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Back
        </button>
        <Button className="btn" style={{ background: 'var(--warn)', color: '#fff' }} onClick={submit} loading={busy} disabled={!reason.trim() || (needAdmin && (!au.trim() || !ap))}>
          Cancel invoice
        </Button>
      </div>
    </Modal>
  )
}
