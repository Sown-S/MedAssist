import { useState } from 'react'
import Button from '../components/Button'
import { useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import BellPortal from '../components/BellPortal'
import { useAuth } from '../context/AuthContext'
import { useQueue, useQueueSync, reviewRedFlag, inviteAgain, isPendingFlag, ST } from '../api/queueStore'
import { useToast } from '../context/ToastContext'
import { useTakePatient } from './doctor/doctorShared'
import { translate } from '../i18n'
import DoctorHome from './doctor/DoctorHome'
import ConsultView from './doctor/ConsultView'
import DrugCabinetView from './doctor/DrugCabinetView'
import PrescriptionsLive from './reception/PrescriptionsLive'
import PatientLookup from './doctor/PatientLookup'
import ClusterAlerts from '../components/ClusterAlerts'
import { hhmm } from '../utils/format'
import ErrorBoundary from '../components/ErrorBoundary'

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
  // Đóng popup chỉ ẩn trong phiên; ca vẫn nằm trong danh sách của chuông tới khi được xử lý.
  const [hiddenRF, setHiddenRF] = useState([])
  // Mới nhất trước; mỗi lúc chỉ một popup để không che màn hình.
  const shownRF = pendingRF.filter((r) => !hiddenRF.includes(r.id)).sort((x, y) => String(y.at).localeCompare(String(x.at)))
  const topRF = shownRF[0]
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
    <div className="content view">
      <div className={view === 'home' ? 'rhome' : 'vflow'}>
        {view !== 'home' && view !== 'consult' && (
          <div className="pg-h">
            <div>
              <h2>{VIEWS[view].title}</h2>
              <p>{VIEWS[view].sub}</p>
            </div>
          </div>
        )}

        {/* Popup cạnh chuông: ca cờ đỏ chưa bác sĩ nào xem (mới nhất, kèm số ca còn lại) và cảnh báo cụm ca ở Trang chủ. */}
        <BellPortal>
          {topRF && (
            <div className="bell-pop redflag-alert" role="alert">
              <div className="ico d">
                <Icon name="siren" />
              </div>
              <div className="bp-t">
                <b>
                  {translate('Red-flag case in the queue')}: {topRF.name}
                  {topRF.age !== '' && topRF.age != null ? ', ' + topRF.age : ''}
                </b>
                <span className="bp-sign">{translate(topRF.signs) || '—'}</span>
                <small className="bp-meta">
                  {hhmm(topRF.at)}
                  {topRF.by && ' · ' + translate('Recorded by') + ' ' + topRF.by}
                  {topRF.allergies ? ' · ' + translate('Drug allergy') + ': ' + translate(topRF.allergies) : ''}
                </small>
                <span className="bp-acts">
                  <Button className="btn btn-danger btn-sm" onClick={() => seeNow(topRF)}>
                    <Icon name="stethoscope" /> See the patient now
                  </Button>
                  <button className="btn btn-outline btn-sm" onClick={() => reviewRedFlag(topRF.id, 'seen', user)}>
                    Dismiss
                  </button>
                  {shownRF.length > 1 && (
                    <button className="btn btn-outline btn-sm bp-more" onClick={() => setHiddenRF((h) => [...h, topRF.id])}>
                      {translate('Next case')} (+{shownRF.length - 1})
                    </button>
                  )}
                </span>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setHiddenRF((h) => [...h, topRF.id])} title={translate('Close')} aria-label={translate('Close')}>
                <Icon name="x" />
              </button>
            </div>
          )}
          {view === 'home' && <ErrorBoundary inline><ClusterAlerts /></ErrorBoundary>}
        </BellPortal>

        {/* Đổi màn bằng menu bên trái (components/SideNav.jsx); phòng khám của bác sĩ hiện ở cuối menu. */}
        {view === 'home' && <DoctorHome go={go} />}
        {view === 'consult' && <ConsultView visitId={visitId} onSelect={(id) => go('consult', id)} />}
        {view === 'prescriptions' && <PrescriptionsLive initialDoctorId={user.id} initialDoctorName={user.name} onRecalled={(id) => go('consult', id)} />}
        {view === 'drugs' && <DrugCabinetView go={go} />}
        {view === 'patients' && <PatientLookup />}
        {dialog}
      </div>
    </div>
  )
}
