import { useMemo, useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { translate } from '../../i18n'
import { logEvent } from '../../api/activityStore'
import { usePatients, ageOf } from '../../api/patientStore'
import { useQueue, statusLabel as statusText, ST } from '../../api/queueStore'
import { useVisitArchive } from '../../api/visitArchive'
import { useRxHistory } from '../../api/rxHistory'
import { useInvoices, invoiceById } from '../../api/invoiceStore'
import { fmt, dmy } from '../reception/shared'

// Hồ sơ bệnh nhân (Quản trị) — bản ẨN DANH: Quản trị viên không xem dữ liệu định danh (Quy định v5 §7, Nghị định 13/2023).
// Chỉ hiện mã bệnh nhân, giới, tuổi, các lần khám với chẩn đoán, thuốc đã kê và thanh toán — đủ để thống kê bệnh thường gặp
// theo mùa và thuốc hay dùng (nền cho AI đề xuất sau này). Không có họ tên, SĐT, ngày sinh, dị ứng, bệnh nền, lý do khám.
// Backend thật: cần endpoint thống kê riêng cho Admin (Sơn) vì GET /patients chặn vai trò Admin.

const OUTCOME = { done: 'Completed', left: 'Left without finishing', carried: 'Unpaid — carried to next day' }
const statusOf = (v) => (v.outcome ? OUTCOME[v.outcome] : statusText(v.status))

// Mọi lượt khám đã biết của từng bệnh nhân: hôm nay → các ngày trước → đơn thuốc cũ chưa có trong lưu trữ lượt khám.
function useVisitsByPatient() {
  const { day, visits } = useQueue()
  const archive = useVisitArchive()
  const rx = useRxHistory()
  useInvoices()
  return useMemo(() => {
    const seen = new Set()
    const map = new Map()
    const add = (v, d) => {
      const key = v.id + '|' + d
      if (!v.patientId || seen.has(key) || (d !== day && seen.has(v.id + '|' + day))) return
      seen.add(key)
      if (!map.has(v.patientId)) map.set(v.patientId, [])
      map.get(v.patientId).push({ ...v, day: d })
    }
    visits.forEach((v) => add(v, day))
    archive.forEach((v) => add(v, v.day))
    rx.forEach((r) => add({ ...r, status: ST.FINISHED }, r.day))
    for (const list of map.values()) list.sort((a, b) => b.day.localeCompare(a.day))
    return map
  }, [day, visits, archive, rx])
}

export default function PatientsPage() {
  const { user } = useAuth()
  const patients = usePatients()
  const byPatient = useVisitsByPatient()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)

  const needle = q.trim().toLowerCase()
  const list = [...patients]
    .sort((a, b) => b.id.localeCompare(a.id))
    .filter((p) => !needle || p.id.toLowerCase().includes(needle) || (byPatient.get(p.id) ?? []).some((v) => (v.diagnosis ?? '').toLowerCase().includes(needle)))

  // Thống kê 30 ngày gần nhất: chẩn đoán và thuốc hay gặp nhất.
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const recent = [...byPatient.values()].flat().filter((v) => v.day >= since)
  const top = (pairs) => [...pairs.reduce((m, [k, n]) => m.set(k, (m.get(k) ?? 0) + n), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topDx = top(recent.filter((v) => v.diagnosis).map((v) => [v.diagnosis, 1]))
  const topRx = top(recent.flatMap((v) => (v.rx ?? []).map((l) => [l.name, 1])))

  function view(p) {
    logEvent(user, 'patient.view', { target: { kind: 'patient', id: p.id, label: p.id }, params: { patient: p.id, mode: 'anonymized' } })
    setOpen(p)
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Patients</h1>
          <p>Anonymized records — patient ID, diagnoses, prescriptions and payments only</p>
        </div>
      </div>
      <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
        <TopList title="Most common diagnoses — last 30 days" rows={topDx} />
        <TopList title="Most prescribed drugs — last 30 days" rows={topRx} />
      </div>
      <div className="cash-filters" style={{ marginBottom: 14 }}>
        <input className="grow" type="search" placeholder="Search by patient ID or diagnosis…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ai-soft" style={{ alignSelf: 'center', fontSize: 13 }}>
          {list.length} {translate('records')}
        </span>
      </div>
      <p className="ai-soft" style={{ fontSize: 12.5, marginTop: 0 }}>
        {translate('Names, phone numbers, dates of birth and allergies are not shown to administrators.')}
      </p>
      <div className="card">
        <table className="dt">
          <thead>
            <tr>
              <th>Patient ID</th>
              <th>Gender</th>
              <th className="num">Age</th>
              <th className="num">Visits</th>
              <th>Last visit</th>
              <th>Last diagnosis</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const visits = byPatient.get(p.id) ?? []
              return (
                <tr key={p.id} className="clickable" onClick={() => view(p)}>
                  <td className="mono">{p.id}</td>
                  <td>{translate(p.gender)}</td>
                  <td className="num mono">{ageOf(p.dob) !== '' ? ageOf(p.dob) : '—'}</td>
                  <td className="num mono">{visits.length}</td>
                  <td className="mono">{visits[0] ? dmy(visits[0].day + 'T00:00:00') : '—'}</td>
                  <td>{visits.find((v) => v.diagnosis)?.diagnosis ?? '—'}</td>
                  <td>
                    <button className="icon-btn sm" title={translate('View details')}>
                      <Icon name="eye" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length && (
          <div className="empty-state">
            <b>No records found</b>
            <span>Try a different keyword.</span>
          </div>
        )}
      </div>
      {open && <PatientDetail p={open} visits={byPatient.get(open.id) ?? []} onClose={() => setOpen(null)} />}
    </div>
  )
}

function TopList({ title, rows }) {
  return (
    <div className="card">
      <div className="card-title">{translate(title)}</div>
      {rows.length ? (
        rows.map(([k, n]) => (
          <div key={k} className="sum-line">
            <span>{k}</span>
            <span className="mono">{n}</span>
          </div>
        ))
      ) : (
        <p className="ai-soft" style={{ fontSize: 13 }}>
          {translate('No data yet.')}
        </p>
      )}
    </div>
  )
}

function PatientDetail({ p, visits, onClose }) {
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Patient') + ' · ' + p.id} onClose={onClose} />
      <div className="form-grid cols-4" style={{ marginBottom: 10 }}>
        <Info label="Gender" value={translate(p.gender)} />
        <Info label="Age" value={ageOf(p.dob) !== '' ? String(ageOf(p.dob)) : '—'} />
        <Info label="Payer type" value={translate(p.payer === 'bhyt' ? 'Health insurance' : 'Self-pay')} />
        <Info label="Visits" value={String(visits.length)} />
      </div>
      <div className="section-label">Visit history</div>
      {visits.length ? (
        <table className="dt">
          <thead>
            <tr>
              <th>Date</th>
              <th>Diagnosis</th>
              <th>Prescription</th>
              <th>Status</th>
              <th className="num">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => {
              const inv = v.invoiceId && invoiceById(v.invoiceId)
              return (
                <tr key={v.id + v.day}>
                  <td className="mono">{dmy(v.day + 'T00:00:00')}</td>
                  <td>
                    {v.diagnosis || '—'}
                    {v.diagnosesExtra?.length > 0 && <span className="ai-soft"> · {v.diagnosesExtra.join('; ')}</span>}
                  </td>
                  <td>{v.rx?.length ? v.rx.map((l) => l.name + ' × ' + l.qty).join(', ') : '—'}</td>
                  <td>{translate(statusOf(v))}</td>
                  <td className="num mono">{inv ? fmt(inv.total) + ' · ' + translate(inv.status === 'cancelled' ? 'Cancelled' : inv.status === 'paid' ? 'Paid' : 'Waiting for transfer') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="ai-soft">{translate('No visits recorded yet.')}</p>
      )}
    </Modal>
  )
}

function Info({ label, value }) {
  return (
    <div className="field">
      <label>{translate(label)}</label>
      <div className="symptom-box" style={{ padding: '8px 11px', fontSize: 13.5 }}>
        {value}
      </div>
    </div>
  )
}
