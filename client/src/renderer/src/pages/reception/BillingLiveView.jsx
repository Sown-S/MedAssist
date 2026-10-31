import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { ErrorBlock, LoadingBlock } from '../../components/DataState'
import { ticketNo } from '../../components/queuePrint'
import { useAwaiting, fromAwaiting, listInvoices, fromServerMethod } from '../../api/billingApi'
import { fold } from '../../api/patientStore'
import { translate } from '../../i18n'
import { fmt, hhmm, ymd, methodLabel, PAY_STATUS } from './shared'

// Màn "Hóa đơn" và "Đơn thuốc" của Lễ tân khi dùng backend thật: các lượt đã chốt đơn còn việc ở quầy
// (GET /billing/awaiting — chưa cấp phát xong và / hoặc chưa thu tiền). Bấm một dòng → PaymentModal (bản chạy thật).
// Tab Hóa đơn có thêm lịch sử hóa đơn theo ngày (GET /billing/invoices). Đơn thuốc cũ xem ở lịch sử của từng bệnh nhân.
// mode: 'invoices' | 'prescriptions' — chỉ khác cột hiển thị và tab mở sẵn trong hộp thoại.
export default function BillingLiveView({ mode, readOnly, onPay }) {
  const awaiting = useAwaiting()
  const [q, setQ] = useState('')
  const all = awaiting.list.map(fromAwaiting)
  const needle = fold(q)
  const list = all.filter((v) => (mode === 'prescriptions' ? v.hasRx : true) && (!needle || fold([v.name, v.invoiceCode ?? ''].join(' ')).includes(needle)))
  const toDispense = all.filter((v) => v.pending > 0).length
  const toCollect = all.filter((v) => v.payStatus === 'Pending').length
  const value = list.reduce((s, v) => s + v.total, 0)

  if (!awaiting.loaded) return <LoadingBlock />

  return (
    <>
      {awaiting.error && <ErrorBlock message={awaiting.error.message} />}
      <div className="inv-stats">
        <div className="inv-stat static">
          <span className="val">{list.length}</span>
          <span className="lbl">Waiting at the desk</span>
        </div>
        <div className="inv-stat static">
          <span className="val">{toDispense}</span>
          <span className="lbl">Waiting to dispense</span>
        </div>
        <div className="inv-stat static">
          <span className="val">{toCollect}</span>
          <span className="lbl">Not paid</span>
        </div>
        <div className="inv-stat static">
          <span className="val mono">{fmt(value)}</span>
          <span className="lbl">To collect</span>
        </div>
      </div>

      <div className="card">
        <div className="cash-filters">
          <input className="grow" type="search" placeholder="Search patient or invoice code…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={awaiting.reload}>
            <Icon name="repeat" /> Refresh
          </button>
        </div>
        <p className="ai-soft" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
          {mode === 'invoices'
            ? translate('Visits with work left at the desk. Invoices already issued are listed by day below.')
            : translate('Only visits with work left at the desk are listed. Paid invoices and earlier prescriptions are in each patient’s history.')}
        </p>
        <table className="dt">
          <thead>
            <tr>
              <th>No.</th>
              <th>Patient</th>
              {mode === 'invoices' && <th>Invoice</th>}
              <th>Dispensing</th>
              <th>Payment</th>
              <th className="num">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} className="clickable" onClick={() => !readOnly && onPay(v)}>
                <td className="mono">{v.ticket ? ticketNo(v.ticket) : '—'}</td>
                <td>
                  <b>{v.name}</b>
                </td>
                {mode === 'invoices' && <td className="mono">{v.invoiceCode ?? '—'}</td>}
                <td>
                  {!v.hasRx ? (
                    <span className="badge muted">{translate('No prescription')}</span>
                  ) : v.pending > 0 ? (
                    <span className="badge warn">
                      {v.pending} {translate('items waiting')}
                    </span>
                  ) : (
                    <span className="badge ok">{translate('Dispensed')}</span>
                  )}
                </td>
                <td>
                  <span className={'badge ' + (v.payStatus === 'Paid' ? 'ok' : 'low')}>{translate(v.payStatus === 'Paid' ? 'Paid' : 'Not paid')}</span>
                </td>
                <td className="num mono">{fmt(v.total)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => onPay(v)}>
                    Dispense &amp; collect
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={mode === 'invoices' ? 7 : 6}>
                  <div className="empty-state">
                    <Icon name="clipboard" />
                    <b>{translate(all.length ? 'No visits match the search.' : 'Nothing waiting at the desk.')}</b>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {mode === 'invoices' && <InvoiceHistory readOnly={readOnly} onPay={onPay} reloadKey={awaiting.list.length} />}
    </>
  )
}

// Hóa đơn đã lập trong một ngày: đã thu, chờ thu, (tùy chọn) đã hủy do sửa. Bấm dòng → mở hộp thu tiền / in lại phiếu.
// reloadKey: số lượt đang chờ thay đổi (vừa thu tiền xong) → tải lại danh sách.
function InvoiceHistory({ readOnly, onPay, reloadKey }) {
  const [date, setDate] = useState(ymd(new Date()))
  const [withCancelled, setWithCancelled] = useState(false)
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    listInvoices(date, withCancelled).then(
      (x) => alive && (setList(x), setError(null)),
      (e) => alive && setError(e)
    )
    return () => (alive = false)
  }, [date, withCancelled, reloadKey])

  const paid = (list ?? []).filter((x) => x.payment_status === 'Paid')
  const revenue = paid.reduce((s, x) => s + Number(x.total_amount), 0)

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-title">
        Invoices by day{' '}
        {list && (
          <span className="cnt">
            {paid.length} {translate('paid')} · {fmt(revenue)}
          </span>
        )}
      </div>
      <div className="cash-filters">
        <input type="date" value={date} max={ymd(new Date())} onChange={(e) => setDate(e.target.value || ymd(new Date()))} />
        <label className="ai-small">
          <input type="checkbox" checked={withCancelled} onChange={(e) => setWithCancelled(e.target.checked)} /> Show cancelled invoices
        </label>
      </div>
      {error && <ErrorBlock message={error.message} />}
      {!list && !error && <p className="ai-soft">Loading…</p>}
      {list && (
        <table className="dt">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>No.</th>
              <th>Patient</th>
              <th>Issued</th>
              <th>Method</th>
              <th>Payment</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => {
              const st = PAY_STATUS[x.payment_status.toLowerCase()] ?? { label: x.payment_status, cls: '' }
              const cancelled = x.payment_status === 'Cancelled'
              return (
                <tr
                  key={x.invoice_id}
                  className={cancelled ? '' : 'clickable'}
                  style={cancelled ? { opacity: 0.6 } : undefined}
                  onClick={() => !cancelled && !readOnly && onPay({ id: x.visit_id, ticket: x.queue_number, name: x.patient_name, tab: 'pay' })}
                >
                  <td className="mono">{x.invoice_code}</td>
                  <td className="mono">{x.queue_number ? ticketNo(x.queue_number) : '—'}</td>
                  <td>
                    <b>{x.patient_name}</b>
                  </td>
                  <td className="mono">{hhmm(x.created_at)}</td>
                  <td>{x.payment_status === 'Paid' ? translate(methodLabel(fromServerMethod(x.payment_method))) : '—'}</td>
                  <td>
                    <span className={'badge ' + st.cls}>{translate(st.label)}</span>
                    {x.paid_at && <div className="ai-soft ai-small mono">{hhmm(x.paid_at)}</div>}
                  </td>
                  <td className="num mono">{fmt(Number(x.total_amount))}</td>
                </tr>
              )
            })}
            {!list.length && (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">
                    <Icon name="clipboard" />
                    <b>{translate('No invoices on this day.')}</b>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
