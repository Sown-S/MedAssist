import { useState } from 'react'
import Icon from '../../components/Icon'
import { ErrorBlock, LoadingBlock } from '../../components/DataState'
import { ticketNo } from '../../components/queuePrint'
import { useAwaiting, fromAwaiting, listInvoices, fromServerMethod } from '../../api/billingApi'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { queryClient } from '../../lib/queryClient'
import { errorMessage } from '../../api/errors'
import { translate } from '../../i18n'
import { methodLabel, PAY_STATUS } from './shared'
import { money, fold, ymd, hhmm } from '../../utils/format'
import { MiniStat, MiniStats } from '../../components/MiniStat'
import Skeleton from '../../components/Skeleton'
import DateField from '../../components/DateField'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'

// Hoá đơn / Đơn thuốc của Lễ tân khi chạy với server: các lượt còn việc ở quầy (GET /billing/awaiting).
// Tab Hoá đơn có thêm lịch sử theo ngày; đơn cũ xem ở lịch sử của từng bệnh nhân.
export default function BillingLiveView({ mode, readOnly, onPay }) {
  const awaiting = useAwaiting()
  const [q, setQ] = useState('')
  const all = awaiting.list.map(fromAwaiting)
  const needle = fold(q)
  const list = all.filter((v) => !needle || fold([v.name, v.invoiceCode ?? ''].join(' ')).includes(needle))
  const toDispense = all.filter((v) => v.pending > 0).length
  const toCollect = all.filter((v) => v.payStatus === 'Pending').length
  const value = list.reduce((s, v) => s + v.total, 0)

  if (!awaiting.loaded) return <LoadingBlock />

  // Màn Hoá đơn: chỉ còn hoá đơn theo ngày; danh sách ở quầy nằm ở màn Cấp phát & thu tiền.
  if (mode === 'invoices') return <InvoiceHistory readOnly={readOnly} onPay={onPay} reloadKey={awaiting.list.length} />

  return (
    <>
      {awaiting.error && <ErrorBlock message={errorMessage(awaiting.error)} onRetry={awaiting.reload} />}
      <MiniStats>
        <MiniStat icon="users" value={list.length} label="Waiting at the desk" />
        <MiniStat icon="package" value={toDispense} label="Waiting to dispense" />
        <MiniStat icon="clock" tone="w" value={toCollect} label="Not paid" />
        <MiniStat icon="wallet" value={money(value)} label="To collect" mono />
      </MiniStats>

      <div className="card">
        <div className="card-b">
          <div className="toolbar mb-14">
            <div className="search">
              <Icon name="search" />
              <input className="input" type="search" placeholder="Search patient or invoice code…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="sp" />
            <button className="btn btn-ghost btn-sm" onClick={awaiting.reload}>
              <Icon name="refresh-cw" />
              {translate('Refresh')}
            </button>
          </div>
          <p className="muted small" style={{ margin: '0 0 10px' }}>
            {mode === 'invoices'
              ? translate('Visits with work left at the desk. Invoices already issued are listed by day below.')
              : translate('Only visits with work left at the desk are listed. Paid invoices and earlier prescriptions are in each patient’s history.')}
          </p>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Patient</th>
                  {mode === 'invoices' && <th>Invoice</th>}
                  <th>Dispensing</th>
                  <th>Payment</th>
                  <th className="r num">Amount</th>
                  <th className="r"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => (
                  <tr key={v.id} className="clickable" onClick={() => !readOnly && onPay(v)}>
                    <td className="num">{v.ticket ? ticketNo(v.ticket) : '—'}</td>
                    <td>
                      <b className="fw-500">{v.name}</b>
                    </td>
                    {mode === 'invoices' && <td className="num">{v.invoiceCode ?? '—'}</td>}
                    <td>
                      {!v.hasRx ? (
                        <Badge tone="neutral">{translate('No prescription')}</Badge>
                      ) : v.pending > 0 ? (
                        <span className="badge b-warning">
                          {v.pending} {translate(v.pending === 1 ? 'item waiting' : 'items waiting')}
                        </span>
                      ) : (
                        <Badge tone="success">{translate('Dispensed')}</Badge>
                      )}
                    </td>
                    <td>{v.payStatus === 'Paid' ? <span className="plain">{translate('Paid')}</span> : <Badge tone="warning">{translate('Not paid')}</Badge>}</td>
                    <td className="r num">
                      <b>{money(v.total)}</b>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="acts">
                        <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => onPay(v)}>
                          Dispense &amp; collect
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!list.length && (
                  <tr>
                    <td colSpan={mode === 'invoices' ? 7 : 6}>
                      <EmptyState icon="clipboard" title={translate(all.length ? 'No visits match the search.' : 'Nothing waiting at the desk.')} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

// reloadKey đổi (vừa thu tiền xong) → tải lại danh sách.
function InvoiceHistory({ readOnly, onPay, reloadKey }) {
  const [date, setDate] = useState(ymd(new Date()))
  const [withCancelled, setWithCancelled] = useState(false)
  const inv = useQuery(
    { queryKey: ['billing', 'invoices', date, withCancelled, reloadKey], queryFn: () => listInvoices(date, withCancelled), placeholderData: keepPreviousData },
    queryClient
  )
  const list = inv.data ?? null
  const error = inv.error

  const paid = (list ?? []).filter((x) => x.payment_status === 'Paid')
  const revenue = paid.reduce((s, x) => s + Number(x.total_amount), 0)

  const unpaid = (list ?? []).filter((x) => !['Paid', 'Cancelled'].includes(x.payment_status))
  return (
    <>
      {list && (
        <MiniStats>
          <MiniStat icon="fileText" value={list.length} label="Invoices" />
          <MiniStat icon="circleCheck" tone="s" value={paid.length} label="Paid" />
          <MiniStat icon="clock" tone="w" value={unpaid.length} label="Not paid" />
          <MiniStat icon="wallet" value={money(revenue)} label="Collected" mono />
        </MiniStats>
      )}
      <div className="card">
        <div className="card-h">
          <h3>Invoices by day</h3>
          {list && (
            <span className="plain">
              {paid.length} {translate('paid')} · {money(revenue)}
            </span>
          )}
        </div>
        <div className="card-b">
          <div className="toolbar mb-14">
            <DateField style={{ width: 160 }} title={translate('Choose a day')} value={date} max={ymd(new Date())} onChange={(v) => setDate(v || ymd(new Date()))} />
            <div className="sp" />
            <label className="check">
              <input type="checkbox" checked={withCancelled} onChange={(e) => setWithCancelled(e.target.checked)} />
              {translate('Show cancelled invoices')}
            </label>
          </div>
          {error && <ErrorBlock message={errorMessage(error)} onRetry={() => inv.refetch()} />}
          {!list && !error && <Skeleton rows={5} cols={5} />}
          {list && (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>No.</th>
                    <th>Patient</th>
                    <th>Issued</th>
                    <th>Method</th>
                    <th>Payment</th>
                    <th className="r num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((x) => {
                    const st = PAY_STATUS[x.payment_status.toLowerCase()] ?? { label: x.payment_status, cls: '' }
                    const cancelled = x.payment_status === 'Cancelled'
                    return (
                      <tr
                        key={x.invoice_id}
                        className={cancelled ? 'dim' : 'clickable'}
                        onClick={() => !cancelled && !readOnly && onPay({ id: x.visit_id, ticket: x.queue_number, name: x.patient_name, tab: 'pay' })}
                      >
                        <td className="num">{x.invoice_code}</td>
                        <td className="num">{x.queue_number ? ticketNo(x.queue_number) : '—'}</td>
                        <td>
                          <b className="fw-500">{x.patient_name}</b>
                        </td>
                        <td className="num muted">{hhmm(x.created_at)}</td>
                        <td>{x.payment_status === 'Paid' ? translate(methodLabel(fromServerMethod(x.payment_method))) : '—'}</td>
                        <td>
                          {st.cls ? <span className={'badge ' + st.cls}>{translate(st.label)}</span> : <span className="plain">{translate(st.label)}</span>}
                          {x.paid_at && <div className="muted small num">{hhmm(x.paid_at)}</div>}
                        </td>
                        <td className="r num">
                          <b>{money(Number(x.total_amount))}</b>
                        </td>
                      </tr>
                    )
                  })}
                  {!list.length && (
                    <tr>
                      <td colSpan="7">
                        <EmptyState icon="clipboard" title={translate('No invoices on this day.')} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
