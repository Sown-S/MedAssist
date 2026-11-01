import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useQueue, isQueued } from '../../api/queueStore'
import { ticketNo } from '../../components/queuePrint'
import CallPanel from './CallPanel'
import { fmt, dmy, ymd } from './shared'
import { useAwaiting, fromAwaiting, useTodayInvoices } from '../../api/billingApi'
import { usePrescriptions } from '../../api/prescriptionApi'

// Lượt Prescribed không có trong GET /queue → lấy từ GET /billing/awaiting.

export default function Dashboard({ go, readOnly, onRegister, onSearch, onPay }) {
  const { visits, redFlags } = useQueue()
  const awaiting = useAwaiting()
  const serverInvoices = useTodayInvoices()
  const serverRx = usePrescriptions({})
  const today = ymd(new Date())
  // GET /billing/invoices đã lọc theo hôm nay (hoá đơn đã thu tính theo giờ thu).
  const invoices = serverInvoices.map((x) => ({ status: x.payment_status.toLowerCase(), method: x.payment_method === 'BankingTransfer' ? 'transfer' : 'cash', createdAt: x.created_at, paidAt: x.paid_at, total: Number(x.total_amount) }))
  const todayInv = invoices.filter((x) => x.status !== 'cancelled')
  const unpaid = awaiting.list.map(fromAwaiting)
  const processing = todayInv.filter((x) => x.status === 'pending' && x.method === 'transfer').length
  const paid = todayInv.filter((x) => x.status === 'paid').length
  // Doanh thu theo giờ thu tiền.
  const revenue = invoices.filter((x) => x.status === 'paid' && ymd(new Date(x.paidAt ?? x.createdAt)) === today).reduce((s, x) => s + x.total, 0)
  const rxCount = serverRx.list.length
  const waiting = visits.filter(isQueued).length

  const cards = [
    {
      key: 'invoices',
      icon: 'banknote',
      tone: 'cyan',
      title: 'Invoices & payments',
      value: todayInv.length,
      sub: `${translate('Collected today')}: ${fmt(revenue)} · ${unpaid.length} ${translate('not paid')} · ${processing} ${translate('waiting for transfer')} · ${paid} ${translate('paid')}`,
      link: 'Click to manage payments →'
    },
    {
      key: 'prescriptions',
      icon: 'clipboard',
      tone: 'violet',
      title: 'Prescriptions today',
      value: rxCount,
      sub: translate('Prescribed by doctors today'),
      link: 'Click to view prescriptions →'
    },
    {
      key: 'queue',
      icon: 'users',
      tone: 'green',
      title: 'Waiting queue',
      value: waiting,
      sub: translate('Waiting for consultation'),
      link: 'Click to manage the queue →'
    },
    {
      key: 'queue',
      icon: 'ban',
      tone: 'red',
      title: 'Red-flag cases',
      value: redFlags.length,
      // Chuyển viện do quầy quyết ngay; ca đưa lên đầu hàng chờ là khám tại phòng khám.
      sub:
        `${redFlags.filter((r) => (r.doctorReview?.decision ?? r.outcome) === 'referred').length} ${translate('referred')} · ` +
        `${redFlags.filter((r) => ['seen', 'queued'].includes(r.doctorReview?.decision ?? r.outcome)).length} ${translate('seen at the clinic')}`,
      link: 'Click to see the cases →',
      alert: redFlags.some((r) => r.outcome === 'queued' && !r.doctorReview)
    }
  ]

  const actions = [
    { icon: 'user', title: 'Register new patient', sub: 'Create a record and issue a number · F2', run: onRegister, write: true },
    { icon: 'search', title: 'Find patient & check in', sub: 'By name, phone or record ID · F3', run: onSearch },
    { icon: 'banknote', title: 'Process payments', sub: 'Cash or bank transfer for finished visits', run: () => go('invoices', 'unpaid') },
    { icon: 'clipboard', title: 'View prescriptions', sub: 'Doctor’s prescriptions — view only', run: () => go('prescriptions') },
    { icon: 'clock', title: 'Confirm transfers', sub: 'Invoices waiting for the money to arrive', run: () => go('invoices', 'processing') },
    { icon: 'folder', title: 'Invoice history', sub: 'Review paid and cancelled invoices', run: () => go('invoices', 'paid') },
    { icon: 'users', title: 'Today’s queue', sub: 'Where each patient is right now', run: () => go('queue') }
  ]

  return (
    <>
      <div className="dash-cards">
        {cards.map((c, i) => (
          <button key={i} className={'dash-card ' + c.tone + (c.alert ? ' alert' : '')} onClick={() => go(c.key)}>
            <span className="head">
              <Icon name={c.icon} /> {c.title}
            </span>
            <span className="val">{c.value}</span>
            <span className="sub">{c.sub}</span>
            <span className="link">{c.link}</span>
          </button>
        ))}
      </div>

      <h2 className="dash-h">Quick actions</h2>
      <div className="dash-actions">
        {actions.map((a) => (
          <button key={a.title} className="dash-action" disabled={a.write && readOnly} onClick={a.run}>
            <Icon name={a.icon} />
            <span>
              <b>{a.title}</b>
              <small>{a.sub}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="dash-bottom">
        <CallPanel readOnly={readOnly} />
        <div className="card">
          <div className="card-title">
            Waiting for dispensing &amp; payment <span className="cnt">{unpaid.length}</span>
          </div>
          {unpaid.map((v) => (
            <div className="pay-row" key={v.id}>
              <span className="mono t">{ticketNo(v.ticket)}</span>
              <span className="nm">
                <b>{v.name}</b>
                <small>
                  {v.doctor}
                  {v.carriedFrom ? ' · ' + translate('Unpaid from') + ' ' + dmy(v.carriedFrom + 'T00:00:00') : ''}
                </small>
              </span>
              <span className="mono amt">{fmt(v.total)}</span>
              <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => onPay(v)}>
                Dispense &amp; collect
              </button>
            </div>
          ))}
          {!unpaid.length && <p className="ai-soft" style={{ fontSize: 14 }}>Nobody is waiting to pay.</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => go('invoices')}>
              All invoices →
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
