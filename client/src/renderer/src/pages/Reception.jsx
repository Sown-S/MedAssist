import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import IntakeModal from '../components/IntakeModal'
import PaymentModal from '../components/PaymentModal'
import RedFlagModal from '../components/RedFlagModal'
import SearchModal from '../components/SearchModal'
import StaleVisitsModal from '../components/StaleVisitsModal'
import Icon from '../components/Icon'
import { useQueue, useQueueSync, syncStale, acknowledgeRedFlag } from '../api/queueStore'
import { translate } from '../i18n'
import Dashboard from './reception/Dashboard'
import QueueView from './reception/QueueView'
import BillingLiveView from './reception/BillingLiveView'
import { hhmm } from './reception/shared'
import useCallAnnouncer from '../components/useCallAnnouncer'
import { useServerOnline } from '../api/connectivity'

// Công cụ cho nhà phát triển (giả lập mất mạng…): chỉ hiện khi VITE_DEV_TOOLS=true.
const DEV_TOOLS = import.meta.env.VITE_DEV_TOOLS === 'true'

const VIEWS = {
  home: { title: 'Reception dashboard', sub: 'Today’s queue, prescriptions and payments at a glance' },
  queue: { title: 'Waiting queue', sub: 'Call patients by the number they hold and follow each step' },
  invoices: { title: 'Invoices & payments', sub: 'Revenue by day, week and month — who has paid, who is waiting for a transfer and who has not paid yet' },
  prescriptions: { title: 'Prescriptions', sub: 'Doctors’ prescriptions by day, week or month — view only, to check invoices' }
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export default function Reception() {
  useQueueSync() // hỏi lại hàng đợi vài giây một lần
  useEffect(() => void syncStale(), [])
  const { redFlags, stale = [] } = useQueue()
  const [staleOpen, setStaleOpen] = useState(false)
  // Tiếng “ding” ở quầy mỗi khi bác sĩ mời bệnh nhân.
  useCallAnnouncer()
  const [params, setParams] = useSearchParams()
  const view = VIEWS[params.get('view')] ? params.get('view') : 'home'
  const go = (v, status) => setParams(v === 'home' ? {} : { view: v, ...(status ? { status } : {}) })

  const serverOnline = useServerOnline()
  const online = useOnline() && serverOnline
  const [simulateOffline, setSimulateOffline] = useState(false)
  // Mất kết nối → chỉ đọc: vẫn xem được, mọi nút ghi bị khoá.
  const readOnly = !online || simulateOffline

  const [intake, setIntake] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [redFlag, setRedFlag] = useState(null)
  const [paying, setPaying] = useState(null)
  const alerts = redFlags.filter((r) => !r.ack)
  const pay = setPaying

  // Phím tắt: F2 đăng ký mới, F3 / Ctrl+K tra cứu.
  useEffect(() => {
    const onKey = (e) => {
      if (intake || searchOpen || redFlag || paying || document.querySelector('.modal-overlay')) return
      if (e.key === 'F2' && !readOnly) {
        e.preventDefault()
        setIntake({ patient: null })
      } else if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [intake, searchOpen, redFlag, paying, readOnly])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          {view !== 'home' && (
            <button className="btn btn-ghost btn-sm back-btn" onClick={() => go('home')}>
              <Icon name="arrowLeft" /> <span>Back to dashboard</span>
            </button>
          )}
          <h1>{VIEWS[view].title}</h1>
          <p>{VIEWS[view].sub}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setSearchOpen(true)} title="F3 / Ctrl+K">
            <Icon name="search" /> Find patient <kbd>F3</kbd>
          </button>
          <button className="btn btn-primary" disabled={readOnly} onClick={() => setIntake({ patient: null })} title="F2">
            + Register new patient <kbd>F2</kbd>
          </button>
        </div>
      </div>

      {DEV_TOOLS && (
        <div className="dev-tools">
          <span className="badge muted">Developer tool</span>
          <label>
            <input type="checkbox" checked={simulateOffline} onChange={(e) => setSimulateOffline(e.target.checked)} />
            Simulate a network outage
          </label>
        </div>
      )}

      {alerts.map((r) => (
        <div className="redflag-alert" key={r.id}>
          <Icon name="ban" />
          <div className="txt">
            <b>
              <span>Red-flag case</span> · {r.name} · {hhmm(r.at)}
            </b>
            <span>{translate(r.signs) || '—'}</span>
            <span className="hint">
              {r.outcome === 'queued'
                ? translate('Emergency — placed at the top of the queue; doctors have been alerted. Transfer to hospital if the patient gets worse.')
                : r.outcome === 'assess'
                ? translate('Waiting for a doctor to assess — keep the patient at the desk.')
                : r.outcome === 'seen'
                  ? translate('Doctor') + ' ' + r.doctorReview.by + ' ' + translate('will see the patient at the clinic — check them in as Priority.')
                  : translate('Emergency — send the patient to hospital now (call 115 if needed); do not wait for a doctor. Doctors have been alerted.') +
                    (r.doctorReview ? ' ' + translate('Confirmed by doctor') + ' ' + r.doctorReview.by + '.' : '')}
            </span>
          </div>
          {r.outcome !== 'assess' && (
            <button className="btn btn-sm" onClick={() => acknowledgeRedFlag(r.id)}>
              {r.outcome === 'seen' ? translate('Done') : translate('Patient guided')}
            </button>
          )}
        </div>
      ))}

      {stale.length > 0 && (
        <div className="warn-banner show caution" style={{ marginTop: 0, marginBottom: 14 }}>
          <div className="icon">
            <Icon name="clock" />
          </div>
          <div className="txt" style={{ flex: 1 }}>
            <b>
              {stale.length} {translate('open visits from previous days')}
            </b>
            <span>{translate('Close them with a reason, or collect payment if the patient came back.')}</span>
          </div>
          <button className="btn btn-sm" onClick={() => setStaleOpen(true)}>
            {translate('Review')}
          </button>
        </div>
      )}

      {readOnly && (
        <div className="warn-banner show caution" style={{ marginTop: 0, marginBottom: 14 }}>
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="txt">
            <b>No connection to the clinic server — read-only mode</b>
            You can still look up patients and view the queue as last loaded. Registering, check-in and payments are locked until the connection
            returns, so nothing is saved twice or lost.
          </div>
        </div>
      )}

      {view === 'home' && (
        <Dashboard go={go} readOnly={readOnly} onRegister={() => setIntake({ patient: null })} onSearch={() => setSearchOpen(true)} onPay={pay} />
      )}
      {view === 'queue' && <QueueView readOnly={readOnly} onPay={pay} />}
      {/* Server liệt kê hoá đơn theo ngày. */}
      {view === 'invoices' && <BillingLiveView mode="invoices" readOnly={readOnly} onPay={(v) => pay({ ...v, tab: 'pay' })} />}
      {view === 'prescriptions' && <BillingLiveView mode="prescriptions" readOnly={readOnly} onPay={pay} />}

      <IntakeModal open={!!intake} patient={intake?.patient ?? null} onClose={() => setIntake(null)} onRedFlag={setRedFlag} />
      <SearchModal
        open={searchOpen}
        readOnly={readOnly}
        onClose={() => setSearchOpen(false)}
        onCheckIn={(p) => {
          setSearchOpen(false)
          setIntake({ patient: p })
        }}
      />
      {paying && (
        <PaymentModal key={paying.id} open initialTab={paying.tab ?? 'dispense'} onClose={() => setPaying(null)} patient={paying} />
      )}
      {staleOpen && <StaleVisitsModal readOnly={readOnly} onClose={() => setStaleOpen(false)} onPay={pay} />}
      <RedFlagModal open={!!redFlag} patient={redFlag} onClose={() => setRedFlag(null)} onReferred={() => setIntake(null)} />
    </div>
  )
}
