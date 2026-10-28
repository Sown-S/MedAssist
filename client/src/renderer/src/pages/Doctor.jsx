import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { useAuth } from '../context/AuthContext'
import { useQueue, useQueueSync, isMine, reviewRedFlag, inRoom } from '../api/queueStore'
import { translate } from '../i18n'
import { hhmm } from './reception/shared'
import DoctorHome from './doctor/DoctorHome'
import ConsultView from './doctor/ConsultView'
import DrugCabinetView from './doctor/DrugCabinetView'
import PrescriptionsView, { RxDetail } from './reception/PrescriptionsView'
import RxReviewPanel from './doctor/RxReviewPanel'
import PatientLookup from './doctor/PatientLookup'
import DocumentModal from './doctor/DocumentModal'

const VIEWS = {
  home: { icon: 'home', tab: 'Overview', title: 'Doctor dashboard', sub: 'Today’s queue, your patients and prescriptions at a glance' },
  consult: { icon: 'stethoscope', tab: 'Consultation room', title: 'Consultation & Prescribing', sub: 'SOAP-based diagnosis, prescribing with a read-only allergy reminder, and stock checks' },
  prescriptions: { icon: 'clipboard', tab: 'Prescriptions', title: 'Prescriptions', sub: 'Prescriptions by day, week or month — filter by doctor and payment status' },
  drugs: { icon: 'box', tab: 'Drug cabinet', title: 'Drug cabinet', sub: 'Usable stock, expiry and price of each drug — view only' },
  patients: { icon: 'search', tab: 'Patient records', title: 'Patient records', sub: 'Look up any patient’s history, add addenda and print documents' }
}

// Trang Bác sĩ: tổng quan + phòng khám + đơn thuốc + tủ thuốc (?view=…, ?visit=… cho bệnh nhân đang khám).
export default function Doctor() {
  const { user } = useAuth()
  useQueueSync() // backend thật: hỏi lại hàng đợi vài giây một lần
  const { visits, redFlags } = useQueue()
  // Ca cờ đỏ lễ tân vừa ghi nhận, chưa bác sĩ nào xem — hiện trên mọi màn của Bác sĩ.
  const pendingRF = redFlags.filter((r) => !r.doctorReview)
  const [params, setParams] = useSearchParams()
  const view = VIEWS[params.get('view')] ? params.get('view') : 'home'
  const visitId = params.get('visit')
  const go = (v, visit) => setParams(v === 'home' ? {} : { view: v, ...(visit ? { visit } : {}) })
  const [rxOf, setRxOf] = useState(null)
  // Ca cờ đỏ bác sĩ vừa quyết định chuyển tuyến → mở luôn giấy chuyển tuyến để in.
  const [referral, setReferral] = useState(null)
  const inRoomCount = visits.filter((v) => inRoom(v) && isMine(v, user)).length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{VIEWS[view].title}</h1>
          <p>{VIEWS[view].sub}</p>
        </div>
      </div>

      {pendingRF.map((r) => (
        <div className="redflag-alert" key={r.id}>
          <Icon name="ban" />
          <div className="txt">
            <b>
              <span>
                {r.outcome === 'queued'
                  ? translate('Red-flag case — top of the queue (Emergency), see the patient now')
                  : r.outcome === 'assess'
                    ? translate('Red-flag case — reception asks a doctor to assess now')
                    : translate('Red-flag case — reception guided a referral')}
              </span>{' '}
              · {r.name}
              {r.age !== '' && r.age != null ? ', ' + r.age : ''} · {hhmm(r.at)}
            </b>
            <span>{translate(r.signs) || '—'}</span>
            <span className="hint">
              {r.outcome === 'referred' && translate('Being transferred to hospital now — come out for first aid if needed, then sign the referral letter.') + ' '}
              {translate('Recorded by')} {r.by}
              {r.allergies ? ' · ' + translate('Drug allergy') + ': ' + translate(r.allergies) : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                reviewRedFlag(r.id, 'referred', user)
                setReferral({ ...r, redFlag: true, diagnosis: '' })
              }}
            >
              {r.outcome === 'assess' || r.outcome === 'queued' ? translate('Refer to hospital') : translate('Acknowledge & write referral letter')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => reviewRedFlag(r.id, 'seen', user)}>
              See at the clinic
            </button>
          </div>
        </div>
      ))}

      <div className="doc-nav-row">
      <div className="ai-seg doc-nav">
        {Object.entries(VIEWS).map(([k, v]) => (
          <button key={k} className={view === k ? 'active' : ''} onClick={() => go(k)}>
            <Icon name={v.icon} /> <span>{v.tab}</span>
            {k === 'consult' && inRoomCount > 0 && <span className="doc-nav-cnt">{inRoomCount}</span>}
          </button>
        ))}
      </div>
      <span className="doc-nav-right">
        {/* Phòng khám cố định do Quản trị viên gán ở Tài khoản nhân viên — không có ca trực */}
        {user.room ? (
          <span className="doc-room" title={translate('Your consultation room')}>
            <Icon name="stethoscope" /> {user.room}
          </span>
        ) : (
          <span className="doc-room warn" title={translate('Reception cannot direct patients to you until you have a room.')}>
            <Icon name="alert" /> No room assigned — ask an administrator
          </span>
        )}
      </span>
      </div>

      {view === 'home' && <DoctorHome go={go} onRx={setRxOf} />}
      {view === 'consult' && <ConsultView visitId={visitId} onSelect={(id) => go('consult', id)} onRx={setRxOf} />}
      {view === 'prescriptions' && <PrescriptionsView readOnly showReviews onRx={setRxOf} initialDoctor={user.name} />}
      {view === 'drugs' && <DrugCabinetView go={go} />}
      {view === 'patients' && <PatientLookup />}
      {referral && <DocumentModal subject={referral} initial="referral" onClose={() => setReferral(null)} />}

      {rxOf && (
        <RxDetail visit={rxOf} readOnly onClose={() => setRxOf(null)}>
          <RxReviewPanel
            visit={rxOf}
            onRecalled={(id) => {
              setRxOf(null)
              go('consult', id)
            }}
          />
        </RxDetail>
      )}
    </div>
  )
}
