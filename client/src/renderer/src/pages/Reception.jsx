import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import IntakeModal from '../components/IntakeModal'
import PaymentModal from '../components/PaymentModal'
import RedFlagModal from '../components/RedFlagModal'
import SearchModal from '../components/SearchModal'
import StaleVisitsModal from '../components/StaleVisitsModal'
import Icon from '../components/Icon'
import { useQueue, useQueueSync, syncStale } from '../api/queueStore'
import { translate } from '../i18n'
import Dashboard from './reception/Dashboard'
import QueueView from './reception/QueueView'
import BillingLiveView from './reception/BillingLiveView'
import PatientsView from './reception/PatientsView'
import HomeGreeting from '../components/HomeGreeting'
import { useAuth } from '../context/AuthContext'
import useCallAnnouncer from '../components/useCallAnnouncer'
import { useServerOnline } from '../api/connectivity'

// Công cụ cho nhà phát triển (giả lập mất mạng…): chỉ hiện khi VITE_DEV_TOOLS=true.
const DEV_TOOLS = import.meta.env.VITE_DEV_TOOLS === 'true'

const STALE_SEEN_KEY = 'medassist_stale_seen'

const VIEWS = {
  home: { title: 'Reception dashboard', sub: 'Today’s queue, prescriptions and payments at a glance' },
  queue: { title: 'Waiting queue', sub: 'Call patients by the number they hold and follow each step' },
  patients: { title: 'Patients', sub: 'All patient records — search, view visit history and check a patient in' },
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
  const { user } = useAuth()
  const { stale = [] } = useQueue()
  const [staleOpen, setStaleOpen] = useState(false)
  const [staleSeen, setStaleSeen] = useState(() => sessionStorage.getItem(STALE_SEEN_KEY) === '1')
  const hideStale = () => {
    sessionStorage.setItem(STALE_SEEN_KEY, '1')
    setStaleSeen(true)
  }
  // Tiếng “ding” ở quầy mỗi khi bác sĩ mời bệnh nhân.
  useCallAnnouncer()
  const [params, setParams] = useSearchParams()
  const view = VIEWS[params.get('view')] ? params.get('view') : 'home'
  const go = (v, status) => setParams(v === 'home' ? {} : { view: v, ...(status ? { status } : {}) })
  // Chuông thông báo mở danh sách lượt tồn bằng ?stale=1.
  useEffect(() => {
    if (params.get('stale') !== '1') return
    setStaleOpen(true)
    const next = new URLSearchParams(params)
    next.delete('stale')
    setParams(next, { replace: true })
  }, [params, setParams])

  const serverOnline = useServerOnline()
  const online = useOnline() && serverOnline
  const [simulateOffline, setSimulateOffline] = useState(false)
  // Mất kết nối → chỉ đọc: vẫn xem được, mọi nút ghi bị khoá.
  const readOnly = !online || simulateOffline

  const [intake, setIntake] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [redFlag, setRedFlag] = useState(null)
  const [paying, setPaying] = useState(null)
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

  const actions = (
    <>
      <button className="btn btn-ghost s-ico" onClick={() => setSearchOpen(true)} title={translate('Find patient') + ' (F3 / Ctrl+K)'} aria-label={translate('Find patient')}>
        <Icon name="search" />
      </button>
      <button className="btn btn-primary" disabled={readOnly} onClick={() => setIntake({ patient: null })} title="F2">
        <Icon name="plus" /> Register new patient <kbd>F2</kbd>
      </button>
    </>
  )

  return (
    <div className={'page' + (view === 'home' ? ' rhome' : '')}>
      {view === 'home' ? (
        <HomeGreeting crumb="Receptionist" name={user.name} extra={<span className="gpill"><Icon name="door" /><span>{translate('Reception desk')}</span></span>}>
          {actions}
        </HomeGreeting>
      ) : (
        <div className="page-head">
          <div>
            <h1>{VIEWS[view].title}</h1>
            <p>{VIEWS[view].sub}</p>
          </div>
          <div className="dash-acts">{actions}</div>
        </div>
      )}

      {DEV_TOOLS && (
        <div className="dev-tools">
          <span className="badge muted">Developer tool</span>
          <label>
            <input type="checkbox" checked={simulateOffline} onChange={(e) => setSimulateOffline(e.target.checked)} />
            Simulate a network outage
          </label>
        </div>
      )}

      {/* Lượt tồn từ ngày trước: popup đỏ cạnh chuông. Ca cờ đỏ nằm ở chuông, ô Ca cấp cứu và trang Hàng chờ. */}
      {stale.length > 0 && !staleSeen && (
        <div className="bell-stack">
          {stale.length > 0 && !staleSeen && (
            <div className="bell-pop" role="alert">
              <div className="bp-ico">
                <Icon name="clock" />
              </div>
              <div className="bp-t">
                <b>
                  {stale.length} {translate('open visits from previous days')}
                </b>
                <span>{translate('Close them with a reason, or collect payment if the patient came back.')}</span>
                <button className="btn btn-sm bp-go" onClick={() => (hideStale(), setStaleOpen(true))}>
                  {translate('Review')}
                </button>
              </div>
              <button className="bp-x" onClick={hideStale} title={translate('Close')} aria-label={translate('Close')}>
                <Icon name="x" />
              </button>
            </div>
          )}
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
        <Dashboard go={go} readOnly={readOnly} onPay={pay} />
      )}
      {view === 'queue' && <QueueView readOnly={readOnly} onPay={pay} />}
      {view === 'patients' && <PatientsView readOnly={readOnly} onCheckIn={(p) => setIntake({ patient: p })} />}
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
