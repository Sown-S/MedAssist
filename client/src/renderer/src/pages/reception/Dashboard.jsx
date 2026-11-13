import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useQueue, isQueued, isPendingFlag, isIntakeOpen, inRoom, atLabs, ST } from '../../api/queueStore'
import { ticketNo } from '../../components/queuePrint'
import { dmy } from './shared'
import { useAwaiting, fromAwaiting, useTodayInvoices } from '../../api/billingApi'
import { usePrescriptions } from '../../api/prescriptionApi'
import { money, ymd } from '../../utils/format'

// Chờ thu tiền lấy từ GET /billing/awaiting (có hoá đơn và số tiền).

export default function Dashboard({ go, readOnly, onPay }) {
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

  // Ô số liệu: nhãn trên, số dưới trái, icon góc dưới phải. Ca cấp cứu chưa bác sĩ xem → ô đỏ nổi bật.
  const tiles = [
    { go: 'queue', icon: 'users', tone: 'g', title: 'Waiting queue', value: waiting },
    { go: 'queue', icon: 'siren', tone: 'r', title: 'Emergency cases', value: redFlags.length, alert: redFlags.some((r) => isPendingFlag(r) && !r.doctorReview) },
    { go: 'prescriptions', icon: 'fileText', tone: 'b', title: 'Prescriptions today', value: rxCount },
    {
      go: 'invoices',
      icon: 'wallet',
      tone: 'b',
      title: 'Collected today',
      value: money(revenue),
      hint: `${unpaid.length} ${translate('not paid')} · ${processing} ${translate('waiting for transfer')} · ${paid} ${translate('paid')}`
    }
  ]

  // F2 đăng ký mới, F3 tìm bệnh nhân nằm ở đầu trang (lời chào); bảng điều khiển giữ các việc thu tiền.
  const actions = [
    { icon: 'banknote', title: 'Process payments', sub: 'Cash or bank transfer for finished visits', run: () => go('invoices', 'unpaid') },
    { icon: 'fileText', title: 'View prescriptions', sub: 'Doctor’s prescriptions — view only', run: () => go('prescriptions') },
    { icon: 'clock', title: 'Confirm transfers', sub: 'Invoices waiting for the money to arrive', run: () => go('invoices', 'processing') },
    { icon: 'history', title: 'Invoice history', sub: 'Review paid and cancelled invoices', run: () => go('invoices', 'paid') }
  ]

  // Hàng chờ hôm nay theo từng bước (lượt đang tiếp đón dở chưa tính).
  const steps = [
    { key: 'c0', icon: 'clock', label: 'Not checked in', n: visits.filter((v) => v.status === ST.WAITING && !isIntakeOpen(v)).length },
    { key: 'c1', icon: 'userCheck', label: 'Checked in', n: visits.filter((v) => v.status === ST.CHECKED_IN).length },
    { key: 'c2', icon: 'stethoscope', label: 'In consultation', n: visits.filter(inRoom).length },
    { key: 'c3', icon: 'flask', label: 'Out for lab tests', n: visits.filter(atLabs).length },
    { key: 'c4', icon: 'wallet', label: 'Awaiting payment', n: visits.filter((v) => v.status === ST.PRESCRIBED).length },
    { key: 'c5', icon: 'circleCheck', label: 'Completed', n: visits.filter((v) => v.status === ST.FINISHED).length }
  ]
  const totalSteps = steps.reduce((t, s) => t + s.n, 0)
  const unpaidTotal = unpaid.reduce((t, v) => t + (Number(v.total) || 0), 0)

  return (
    <>
      <div className="kpis rk">
        {tiles.map((c) => (
          <button key={c.title} className={'tile rt ' + c.tone + (c.alert ? ' alert' : '')} onClick={() => go(c.go)} title={c.hint}>
            <span className="tl">{translate(c.title)}</span>
            <span className="rt-b">
              <b className="rt-n val">{c.value}</b>
              <span className="chip">
                <Icon name={c.icon} />
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Control panel</div>
        <div className="quick q4">
          {actions.map((a) => (
            <button key={a.title} className="qa qv" onClick={a.run}>
              <span className="ico">
                <Icon name={a.icon} />
              </span>
              <span>
                <b>{translate(a.title)}</b>
                <small>{translate(a.sub)}</small>
              </span>
              <Icon name="arrowUpRight" className="qa-go" />
            </button>
          ))}
        </div>
      </div>

      <div className="dash-bottom two">
        <div className="card pay-card">
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
              <span className="mono amt">{money(v.total)}</span>
              <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => onPay(v)}>
                Dispense &amp; collect
              </button>
            </div>
          ))}
          {!unpaid.length && <p className="ai-soft" style={{ fontSize: 14 }}>Nobody is waiting to pay.</p>}
          <div className="pay-foot">
            {unpaid.length > 0 && (
              <span>
                {translate('Total awaiting payment')} <b className="mono">{money(unpaidTotal)}</b>
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => go('invoices')}>
              All invoices →
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-title">
            <span>Today’s queue</span>
          </div>
          <div className="pipe">
            <div className="pipe-top">
              <b className="mono">{totalSteps}</b>
              <span>{translate('visits today')}</span>
            </div>
            <div className="pipe-bar" aria-hidden="true">
              {totalSteps ? steps.filter((s) => s.n).map((s) => <i key={s.key} className={s.key} style={{ flex: s.n }} />) : <i style={{ flex: 1, background: 'var(--border)' }} />}
            </div>
            <div className="pipe-g">
              {steps.map((s) => (
                <div key={s.key} className={s.key}>
                  <span className="pi">
                    <Icon name={s.icon} />
                  </span>
                  <span>
                    <b className="mono">{s.n}</b>
                    <small>{translate(s.label)}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
