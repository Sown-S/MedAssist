import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import Modal, { ModalHeader } from '../../components/Modal'
import { ageOf } from '../../api/patient'
import { statusLabel } from '../../api/queueStore'
import { translate } from '../../i18n'
import { listPatients, getPatient, patientVisits } from '../../api/clinicApi'
import { dmy } from './shared'

const PAGE = 20
const EMPTY = { q: '', phone: '', idNumber: '', code: '', birthYear: '' }
// Chỉ gửi điều kiện đã gõ đủ dạng để server không trả lỗi kiểm tra (422) khi đang gõ dở.
const ready = (f) => ({
  q: f.q.trim(),
  phone: /^0\d{9}$/.test(f.phone.replace(/\s/g, '')) ? f.phone.replace(/\s/g, '') : '',
  idNumber: /^(\d{9}|\d{12})$/.test(f.idNumber.trim()) ? f.idNumber.trim() : '',
  code: /^(?:[Bb][Nn]-?)?[0-9A-Fa-f]{8}$/.test(f.code.trim()) ? f.code.trim() : '',
  birthYear: /^\d{4}$/.test(f.birthYear.trim()) ? f.birthYear.trim() : ''
})
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

// Trang Bệnh nhân của Lễ tân: mọi hồ sơ (GET /patients), lọc theo từng ô như mẫu (họ tên, SĐT, CCCD, mã BN, năm sinh),
// xem lịch sử khám (GET /patients/{id}/visits) và tiếp đón lại.
export default function PatientsView({ readOnly, onCheckIn }) {
  const [f, setF] = useState(EMPTY)
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState({ total: 0, items: [] })
  const [status, setStatus] = useState('loading')
  const [history, setHistory] = useState(null)
  const filters = ready(f)
  const key = JSON.stringify(filters)

  useEffect(() => {
    let stop = false
    setStatus('loading')
    const t = setTimeout(() => {
      listPatients({ ...JSON.parse(key), limit: PAGE, offset }).then(
        (r) => !stop && (setData(r), setStatus('ready')),
        () => !stop && setStatus('failed')
      )
    }, 300)
    return () => {
      stop = true
      clearTimeout(t)
    }
  }, [key, offset])

  const set = (k) => (e) => (setF((x) => ({ ...x, [k]: e.target.value })), setOffset(0))
  async function checkIn(p) {
    const full = await getPatient(p.id).catch(() => p)
    onCheckIn(full)
  }
  const from = data.total ? offset + 1 : 0
  const to = Math.min(offset + PAGE, data.total)
  const dirty = Object.values(f).some((v) => v.trim())

  return (
    <div className="card">
      <div className="pt-filters">
        <div className="ai-search pt-q">
          <Icon name="search" />
          <input type="search" value={f.q} onChange={set('q')} placeholder={translate('Full name (with or without accents)')} aria-label={translate('Full name')} />
        </div>
        <input className="pt-in" value={f.phone} onChange={set('phone')} placeholder={translate('Phone')} aria-label={translate('Phone')} inputMode="numeric" />
        <input className="pt-in" value={f.idNumber} onChange={set('idNumber')} placeholder={translate('ID card')} aria-label={translate('ID card')} inputMode="numeric" />
        <input className="pt-in" value={f.code} onChange={set('code')} placeholder={translate('Patient code, e.g. BN-3F2A9C1B')} aria-label={translate('Record code')} />
        <input className="pt-in pt-year" value={f.birthYear} onChange={set('birthYear')} placeholder={translate('Year of birth')} aria-label={translate('Year of birth')} inputMode="numeric" />
        {dirty && (
          <button className="btn btn-ghost btn-sm pt-clear" onClick={() => (setF(EMPTY), setOffset(0))}>
            Clear filters
          </button>
        )}
      </div>
      {status === 'failed' && <p className="sym-warn">{translate('Could not load the patient list from the server.')}</p>}
      <table className="dt pt-table">
        <thead>
          <tr>
            <th>Record code</th>
            <th>Full name</th>
            <th>Date of birth</th>
            <th>Gender</th>
            <th>Phone</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.items.map((p) => (
            <tr key={p.id}>
              <td className="pt-code">{p.code}</td>
              <td>
                <span className="pt-who">
                  <span className="avatar">{initials(p.name)}</span>
                  <b>{p.name}</b>
                </span>
              </td>
              <td>
                {p.dob}{' '}
                <small className="pt-age">
                  · {ageOf(p.dob)} {translate('yrs')}
                </small>
              </td>
              <td>{translate(p.gender)}</td>
              <td>{p.phone || '—'}</td>
              <td>
                <span className="pt-acts">
                  <button className="icon-btn" title={translate('Visit history')} aria-label={translate('Visit history')} onClick={() => setHistory(p)}>
                    <Icon name="history" />
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={readOnly} onClick={() => checkIn(p)}>
                    <Icon name="userCheck" /> Check in
                  </button>
                </span>
              </td>
            </tr>
          ))}
          {status === 'ready' && !data.items.length && (
            <tr>
              <td colSpan="6" className="ai-soft">
                {dirty ? translate('No matching patient.') : translate('No patient records yet.')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="pt-pager">
        <span>
          {translate('Showing')} {from}–{to} / {data.total.toLocaleString('vi-VN')} {translate('records')}
        </span>
        <span className="pt-pager-btns">
          {offset > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              ← Previous
            </button>
          )}
          {offset + PAGE < data.total && (
            <button className="btn btn-ghost btn-sm" onClick={() => setOffset(offset + PAGE)}>
              Next →
            </button>
          )}
        </span>
      </div>
      {history && <VisitHistoryModal patient={history} onClose={() => setHistory(null)} />}
    </div>
  )
}

function VisitHistoryModal({ patient, onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let stop = false
    patientVisits(patient.id).then(
      (r) => !stop && setRows(r.items),
      () => !stop && setRows([])
    )
    return () => {
      stop = true
    }
  }, [patient.id])
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Visit history') + ' — ' + patient.name} onClose={onClose} />
      <div className="modal-body">
        {rows === null ? (
          <p className="ai-soft">{translate('Loading…')}</p>
        ) : rows.length ? (
          <table className="dt">
            <thead>
              <tr>
                <th>Visit date</th>
                <th>Reason for visit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>{dmy(v.at)}</td>
                  <td>{v.reason || '—'}</td>
                  <td>{v.referred ? translate('Referred') : translate(statusLabel(v.status))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="ai-soft">{translate('No visits yet.')}</p>
        )}
      </div>
    </Modal>
  )
}
