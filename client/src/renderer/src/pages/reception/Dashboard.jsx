import { HomeTile } from '../../components/StatCard'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useQueue, isQueued, isPendingFlag, isIntakeOpen, inRoom, atLabs, ST } from '../../api/queueStore'
import { ticketNo } from '../../components/queuePrint'
import { useAwaiting, fromAwaiting, useTodayInvoices } from '../../api/billingApi'
import { usePrescriptions } from '../../api/prescriptionApi'
import { money, ymd, dmy } from '../../utils/format'

// Chờ thu tiền lấy từ GET /billing/awaiting (có hoá đơn và số tiền).

export default function Dashboard({ go, readOnly, onPay }) {
  const { visits, redFlags, loaded: queueLoaded, loadFailed } = useQueue()
  const awaiting = useAwaiting()
  const serverInvoices = useTodayInvoices()
  const serverRx = usePrescriptions({})
  const today = ymd(new Date())
  // GET /billing/invoices đã lọc theo hôm nay (hoá đơn đã thu tính theo giờ thu).
  const invoices = (serverInvoices ?? []).map((x) => ({ status: x.payment_status.toLowerCase(), method: x.payment_method === 'BankingTransfer' ? 'transfer' : 'cash', createdAt: x.created_at, paidAt: x.paid_at, total: Number(x.total_amount) }))
  const todayInv = invoices.filter((x) => x.status !== 'cancelled')
  const unpaid = awaiting.list.map(fromAwaiting)
  const processing = todayInv.filter((x) => x.status === 'pending' && x.method === 'transfer').length
  const paid = todayInv.filter((x) => x.status === 'paid').length
  // Doanh thu theo giờ thu tiền.
  const revenue = invoices.filter((x) => x.status === 'paid' && ymd(new Date(x.paidAt ?? x.createdAt)) === today).reduce((s, x) => s + x.total, 0)
  const rxCount = serverRx.list.length
  const waiting = visits.filter(isQueued).length
  // Chưa có dữ liệu → undefined để ô hiện khung xương thay vì số 0; tải lỗi → “—”.
  const when = (ok, v, failed) => (ok ? v : failed ? '—' : undefined)
  const moneyLoaded = serverInvoices !== null && awaiting.loaded

  // Ô số liệu: nhãn trên, số dưới trái, icon góc dưới phải. Ca cấp cứu chưa bác sĩ xem → ô đỏ nổi bật.
  const tiles = [
    { go: 'queue', icon: 'users', tone: 'g', title: 'Waiting queue', value: when(queueLoaded, waiting, loadFailed), sub: translate(waiting ? 'patients waiting for a doctor' : 'No one is waiting.') },
    (() => {
      const pending = redFlags.filter((r) => isPendingFlag(r) && !r.doctorReview).length
      return { go: 'queue', icon: 'siren', tone: 'r', title: 'Emergency cases', value: when(queueLoaded, redFlags.length, loadFailed), alert: pending > 0, sub: pending ? `${pending} ${translate('waiting for a doctor to review')}` : translate('No case needs action') }
    })(),
    { go: 'prescriptions', icon: 'file-text', tone: 'b', title: 'Prescriptions today', value: when(serverRx.loaded, rxCount, !!serverRx.error), sub: translate('written by doctors today') },
    {
      go: 'invoices',
      icon: 'wallet',
      tone: 'v',
      title: 'Collected today',
      value: when(moneyLoaded, money(revenue)),
      sub: `${unpaid.length} ${translate('not paid')} · ${processing} ${translate('waiting for transfer')}`,
      hint: `${unpaid.length} ${translate('not paid')} · ${processing} ${translate('waiting for transfer')} · ${paid} ${translate('paid')}`
    }
  ]

  // F2 đăng ký mới, F3 tìm bệnh nhân nằm ở đầu trang (lời chào); bảng điều khiển giữ các việc thu tiền.
  const actions = [
    { icon: 'banknote', title: 'Process payments', sub: 'Cash or bank transfer for finished visits', run: () => go('payments') },
    { icon: 'file-text', title: 'View prescriptions', sub: 'Doctor’s prescriptions — view only', run: () => go('prescriptions') },
    { icon: 'clock', title: 'Confirm transfers', sub: 'Invoices waiting for the money to arrive', run: () => go('invoices') },
    { icon: 'history', title: 'Invoice history', sub: 'Review paid and cancelled invoices', run: () => go('invoices') }
  ]

  // Hàng chờ hôm nay theo từng bước (lượt đang tiếp đón dở chưa tính).
  const steps = [
    { key: 'c0', icon: 'clock', label: 'Not checked in', n: visits.filter((v) => v.status === ST.WAITING && !isIntakeOpen(v)).length },
    { key: 'c1', icon: 'user-check', label: 'Checked in', n: visits.filter((v) => v.status === ST.CHECKED_IN).length },
    { key: 'c2', icon: 'stethoscope', label: 'In consultation', n: visits.filter(inRoom).length },
    { key: 'c3', icon: 'flask-conical', label: 'Out for lab tests', n: visits.filter(atLabs).length },
    { key: 'c4', icon: 'wallet', label: 'Awaiting payment', n: visits.filter((v) => v.status === ST.PRESCRIBED).length },
    { key: 'c5', icon: 'circle-check', label: 'Completed', n: visits.filter((v) => v.status === ST.FINISHED).length }
  ]
  const totalSteps = steps.reduce((t, s) => t + s.n, 0)
  const unpaidTotal = unpaid.reduce((t, v) => t + (Number(v.total) || 0), 0)

  return (
    <>
      <div className="kpis rk">
        {tiles.map((c) => (
          <HomeTile key={c.title} tone={c.tone} icon={c.icon} label={c.title} value={c.value} sub={c.sub} alert={c.alert} title={c.hint} onClick={() => go(c.go)} />
        ))}
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Control panel</h3>
        </div>
        <div className="card-b quick q4">
          {actions.map((a) => (
            <button key={a.title} className="qa qv" onClick={a.run}>
              <div className="ico p">
                <Icon name={a.icon} />
              </div>
              <div>
                <b>{translate(a.title)}</b>
                <span>{translate(a.sub)}</span>
              </div>
              <Icon name="arrow-up-right" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2e">
        <div className="card">
          <div className="card-h">
            <h3>Waiting for dispensing &amp; payment</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => go('payments')}>
              <span>All invoices →</span>
            </button>
          </div>
          <div className="card-b">
            {unpaid.length ? (
              <>
                <div className="rows">
                  {unpaid.map((v) => (
                    <div className="r" key={v.id}>
                      <span className="stt num w-40 fw-700">
                        {ticketNo(v.ticket)}
                      </span>
                      <div className="t">
                        <b>{v.name}</b>
                        <span>
                          {v.doctor}
                          {v.carriedFrom ? ' · ' + translate('Unpaid from') + ' ' + dmy(v.carriedFrom + 'T00:00:00') : ''}
                        </span>
                      </div>
                      <b className="num">{money(v.total)}</b>
                      <button className="btn btn-outline btn-sm" disabled={readOnly} onClick={() => onPay(v)}>
                        <Icon name="package" />
                        <span>Dispense &amp; collect</span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="pay-foot">
                  <span>
                    {unpaid.length} {translate('patients')}
                  </span>
                  <span>
                    {translate('Total awaiting payment')} <b className="num">{money(unpaidTotal)}</b>
                  </span>
                </div>
              </>
            ) : (
              <div className="empty">
                <div className="ill">
                  <Icon name="circle-check-big" />
                </div>
                <b>Nobody is waiting to pay.</b>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <h3>Today’s queue</h3>
            <span className="plain">Where each patient is right now</span>
          </div>
          <div className="card-b">
            <div className="pipe">
              <div className="pipe-top">
                <b className="num">{totalSteps}</b>
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
                    <div>
                      <b className="num">{s.n}</b>
                      <span>{translate(s.label)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
