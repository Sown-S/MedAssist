import { useState } from 'react'
import Icon from '../../components/Icon'
import { ErrorBlock, LoadingBlock } from '../../components/DataState'
import { ticketNo } from '../../components/queuePrint'
import { useAwaiting, fromAwaiting } from '../../api/billingApi'
import { fold } from '../../api/patientStore'
import { translate } from '../../i18n'
import { fmt } from './shared'

// Màn "Hóa đơn" và "Đơn thuốc" của Lễ tân khi dùng backend thật: các lượt đã chốt đơn còn việc ở quầy
// (GET /billing/awaiting — chưa cấp phát xong và / hoặc chưa thu tiền). Bấm một dòng → PaymentModal (bản chạy thật).
// Server chưa có API liệt kê hóa đơn / đơn thuốc đã xong theo ngày, nên lịch sử chưa hiện ở đây.
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
          Only visits with work left at the desk are listed. Paid invoices and earlier prescriptions are in each patient’s history.
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
    </>
  )
}
