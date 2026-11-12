import { useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { useAuth } from '../context/AuthContext'
import { useQueue, useQueueSync, reviewRedFlag, inviteAgain, isPendingFlag, ST } from '../api/queueStore'
import { useToast } from '../context/ToastContext'
import { useTakePatient } from './doctor/doctorShared'
import { translate } from '../i18n'
import { hhmm } from './reception/shared'
import DoctorHome from './doctor/DoctorHome'
import ConsultView from './doctor/ConsultView'
import DrugCabinetView from './doctor/DrugCabinetView'
import PrescriptionsLive from './reception/PrescriptionsLive'
import PatientLookup from './doctor/PatientLookup'
import HomeGreeting from '../components/HomeGreeting'

const VIEWS = {
  home: { icon: 'home', tab: 'Overview', title: 'Doctor dashboard', sub: 'Today’s queue, your patients and prescriptions at a glance' },
  consult: { icon: 'stethoscope', tab: 'Consultation room', title: 'Consultation & Prescribing', sub: 'SOAP-based diagnosis, prescribing with a read-only allergy reminder, and stock checks' },
  prescriptions: { icon: 'clipboard', tab: 'Prescriptions', title: 'Prescriptions', sub: 'Prescriptions by day, week or month — filter by doctor and payment status' },
  drugs: { icon: 'box', tab: 'Drug cabinet', title: 'Drug cabinet', sub: 'Usable stock, expiry and price of each drug — view only' },
  patients: { icon: 'search', tab: 'Patient records', title: 'Patient records', sub: 'Look up any patient’s history, add addenda and print documents' }
}

export default function Doctor() {
  const { user } = useAuth()
  useQueueSync() // hỏi lại hàng đợi vài giây một lần
  const { visits, redFlags } = useQueue()
  // Ca cờ đỏ chưa bác sĩ nào xem — hiện trên mọi màn của Bác sĩ.
  const pendingRF = redFlags.filter((r) => isPendingFlag(r) && !r.doctorReview)
  const [params, setParams] = useSearchParams()
  const view = VIEWS[params.get('view')] ? params.get('view') : 'home'
  const visitId = params.get('visit')
  const go = (v, visit) => setParams(v === 'home' ? {} : { view: v, ...(visit ? { visit } : {}) })
  const { showToast } = useToast()
  const { take, dialog } = useTakePatient((id) => go('consult', id))
  // Ca cờ đỏ là lượt Cấp cứu đang chờ — bác sĩ mời vào khám ngay, chuyển tuyến làm trong phòng khám.
  async function seeNow(r) {
    const v = visits.find((x) => x.id === r.visitId)
    if (!v) return
    if (v.status === ST.CHECKED_IN) return take(v)
    const res = await inviteAgain(v.id)
    showToast(res.ok ? translate('Invited') + ' — ' + v.name + '. ' + translate('Reception will send the patient in.') : translate(res.error), res.ok ? 'ok' : 'error')
  }

  return (
    <div className={'page' + (view === 'home' ? ' rhome' : '')}>
      {view === 'home' ? (
        <HomeGreeting
          crumb="Doctor"
          name={user.name}
          extra={
            user.room && (
              <span className="gpill">
                <Icon name="stethoscope" />
                <span>{user.room}</span>
              </span>
            )
          }
        >
          <button className="btn btn-ghost" onClick={() => go('consult')}>
            <Icon name="stethoscope" /> Consultation room
          </button>
        </HomeGreeting>
      ) : (
        view !== 'consult' && (
          <div className="page-head">
            <div>
              <h1>{VIEWS[view].title}</h1>
              <p>{VIEWS[view].sub}</p>
            </div>
          </div>
        )
      )}

      {pendingRF.map((r) => (
        <div className="redflag-alert" key={r.id}>
          <Icon name="ban" />
          <div className="txt">
            <b>
              <span>
                {translate('Red-flag case — top of the queue (Emergency), see the patient now')}
              </span>{' '}
              · {r.name}
              {r.age !== '' && r.age != null ? ', ' + r.age : ''} · {hhmm(r.at)}
            </b>
            <span>{translate(r.signs) || '—'}</span>
            <span className="hint">
              {translate('Emergency — top of the queue. Call the patient in now; refer to hospital from the consultation if needed.')}
              {r.by && translate('Recorded by') + ' ' + r.by}
              {r.allergies ? ' · ' + translate('Drug allergy') + ': ' + translate(r.allergies) : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => seeNow(r)}>
              <Icon name="stethoscope" /> See the patient now
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => reviewRedFlag(r.id, 'seen', user)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}

      {/* Đổi màn bằng menu bên trái (components/SideNav.jsx); phòng khám của bác sĩ hiện ở cuối menu. */}
      {view === 'home' && <DoctorHome go={go} />}
      {view === 'consult' && <ConsultView visitId={visitId} onSelect={(id) => go('consult', id)} />}
      {view === 'prescriptions' && <PrescriptionsLive initialDoctorId={user.id} initialDoctorName={user.name} onRecalled={(id) => go('consult', id)} />}
      {view === 'drugs' && <DrugCabinetView go={go} />}
      {view === 'patients' && <PatientLookup />}
      {dialog}

    </div>
  )
}
