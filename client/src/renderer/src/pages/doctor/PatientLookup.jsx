import { useEffect, useRef, useState } from 'react'
import PatientAlerts from '../../components/PatientAlerts'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { translate } from '../../i18n'
import { logEvent } from '../../api/activityStore'
import { usePatients, searchPatients, ageOf } from '../../api/patientStore'
import { useQueue, STATUSES, statusLabel } from '../../api/queueStore'
import { useVisitArchive } from '../../api/visitArchive'
import { useRxHistory } from '../../api/rxHistory'
import { pastVisitsOf } from './doctorShared'
import { VisitCard } from './ConsultView'
import DocumentModal from './DocumentModal'

// Bác sĩ tra cứu hồ sơ BẤT KỲ bệnh nhân nào (không chỉ người đang trong hàng chờ) — VD bệnh nhân gọi điện hỏi kết quả,
// cần xem đơn cũ, ghi bổ sung kết quả về muộn, in tóm tắt bệnh án / giấy chuyển tuyến. Mỗi lần mở hồ sơ được ghi nhật ký.
export default function PatientLookup() {
  const { user } = useAuth()
  usePatients()
  const { visits } = useQueue()
  const archive = useVisitArchive()
  const history = useRxHistory()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [docs, setDocs] = useState(null)
  const logged = useRef(new Set())

  const results = searchPatients(q, 50)
  const p = sel && (results.find((r) => r.id === sel) ?? searchPatients(sel, 1)[0])
  const past = p ? pastVisitsOf(p.id, { visits, archive, history }) : []
  const today = p && [...visits].reverse().find((v) => v.patientId === p.id)

  // Ghi nhật ký "xem hồ sơ" một lần cho mỗi bệnh nhân được mở trong phiên này.
  useEffect(() => {
    if (!p || logged.current.has(p.id)) return
    logged.current.add(p.id)
    logEvent(user, 'patient.view', { target: { kind: 'patient', id: p.id, label: p.name }, params: { patient: p.name, mode: 'lookup' } })
  }, [p, user])

  const subject = p && { ...p, age: ageOf(p.dob), patientId: p.id, diagnosis: past[0]?.diagnosis ?? '', rx: past[0]?.rx ?? [] }
  return (
    <div className="lookup">
      <div className="card lookup-list">
        <input className="pl-search" type="search" autoFocus placeholder="Name, phone number or record ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.map((r) => (
          <button key={r.id} className={'pl-row' + (r.id === p?.id ? ' active' : '')} onClick={() => setSel(r.id)}>
            <span className="nm">{r.name}</span>
            <span className="sub">
              <span className="mono">{r.id}</span> · {r.dob} · <span className="mono">{r.phone}</span>
            </span>
          </button>
        ))}
        {q.trim() && !results.length && <p className="ai-soft" style={{ fontSize: 13, padding: 8 }}>No patient matches.</p>}
        {!q.trim() && <p className="ai-soft" style={{ fontSize: 13, padding: 8 }}>Type at least part of a name, phone number or record ID.</p>}
      </div>

      {p ? (
        <div className="card">
          <div className="consult-head">
            <div>
              <h2>{p.name}</h2>
              <div className="sub">
                {translate(p.gender)} · {p.dob} ({ageOf(p.dob)} {translate('yrs')}) · <span className="mono">{p.id}</span> · <span className="mono">{p.phone}</span>
              </div>
            </div>
            {today && <span className="status-chip">{translate('Today') + ': ' + translate(statusLabel(today.status))}</span>}
          </div>
          <PatientAlerts p={p} />
          <div className="lookup-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setDocs(true)}>
              <Icon name="repeat" /> Referral letter
            </button>
          </div>
          <div className="section-label">
            Visits <span className="itab-cnt">{past.length}</span>
          </div>
          {past.length ? (
            <div className="timeline">
              {past.map((v) => (
                <VisitCard key={v.id + (v.day ?? '')} v={v} />
              ))}
            </div>
          ) : (
            <p className="ai-soft" style={{ fontSize: 13 }}>No earlier visits in the system.</p>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <Icon name="search" />
            <b>Find a patient</b>
            <span>Search by name, phone number or record ID to see their full history or print a referral letter.</span>
          </div>
        </div>
      )}
      {docs && subject && <DocumentModal subject={subject} onClose={() => setDocs(null)} />}
    </div>
  )
}
