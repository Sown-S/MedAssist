import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import Modal, { ModalHeader } from '../../components/Modal'
import { ageOf } from '../../api/patient'
import { statusLabel } from '../../api/queueStore'
import { translate } from '../../i18n'
import { listPatients, getPatient, patientVisits } from '../../api/clinicApi'
import Skeleton from '../../components/Skeleton'
import { dmy, fmtNum } from '../../utils/format'

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
      <div className="card-b">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <div className="search" style={{ width: 300 }}>
            <Icon name="search" />
            <input className="input" type="search" value={f.q} onChange={set('q')} placeholder={translate('Full name (with or without accents)')} aria-label={translate('Full name')} />
          </div>
          <input className="input" style={{ width: 160, height: 40 }} value={f.phone} onChange={set('phone')} placeholder={translate('Phone')} aria-label={translate('Phone')} inputMode="numeric" />
          <input
            className="input"
            style={{ width: 150, height: 40 }}
            value={f.idNumber}
            onChange={set('idNumber')}
            placeholder={translate('ID card')}
            aria-label={translate('ID card')}
            inputMode="numeric"
          />
          <input
            className="input"
            style={{ width: 200, height: 40 }}
            value={f.code}
            onChange={set('code')}
            placeholder={translate('Patient code, e.g. BN-3F2A9C1B')}
            aria-label={translate('Record code')}
          />
          <input
            className="input num"
            style={{ width: 110, height: 40 }}
            value={f.birthYear}
            onChange={set('birthYear')}
            placeholder={translate('Year of birth')}
            aria-label={translate('Year of birth')}
            inputMode="numeric"
          />
          <button className="btn btn-ghost btn-sm" disabled={!dirty} onClick={() => (setF(EMPTY), setOffset(0))}>
            {translate('Clear filters')}
          </button>
        </div>
        {status === 'failed' && <p className="sym-warn">{translate('Could not load the patient list from the server.')}</p>}
        <div className="tbl-wrap">
          {data.items.length || status !== 'ready' ? (
            <table>
              <thead>
                <tr>
                  <th>Record code</th>
                  <th>Full name</th>
                  <th>Date of birth</th>
                  <th>Gender</th>
                  <th>Phone</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="num muted">{p.code}</td>
                    <td>
                      <div className="who-cell">
                        <div className="ava">{initials(p.name)}</div>
                        <b className="clip" style={{ maxWidth: 260 }}>
                          {p.name}
                        </b>
                      </div>
                    </td>
                    <td className="r num">
                      {p.dob}{' '}
                      <span className="muted small">
                        · {ageOf(p.dob)} {translate('yrs')}
                      </span>
                    </td>
                    <td>{translate(p.gender)}</td>
                    <td className="r num">{p.phone || '—'}</td>
                    <td>
                      <div className="acts">
                        <button className="btn btn-ghost btn-icon" title={translate('Visit history')} aria-label={translate('Visit history')} onClick={() => setHistory(p)}>
                          <Icon name="history" />
                        </button>
                        <button className="btn btn-outline btn-sm" disabled={readOnly} onClick={() => checkIn(p)}>
                          <Icon name="user-check" />
                          {translate('Check in')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              <div className="ill">
                <Icon name="contact-round" />
              </div>
              <b>{dirty ? translate('No matching patient.') : translate('No patient records yet.')}</b>
            </div>
          )}
        </div>
        <div className="pager">
          <span>
            {translate('Showing')} {from}–{to} / {fmtNum(data.total)} {translate('records')}
          </span>
          <span className="acts">
            {offset > 0 && (
              <button className="btn btn-outline btn-sm" onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                {translate('← Previous')}
              </button>
            )}
            {offset + PAGE < data.total && (
              <button className="btn btn-outline btn-sm" onClick={() => setOffset(offset + PAGE)}>
                {translate('Next →')}
              </button>
            )}
          </span>
        </div>
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
      <div className="modal-b">
        {rows === null ? (
          <Skeleton rows={4} />
        ) : rows.length ? (
          <div className="tbl-wrap">
            <table>
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
                    <td className="num">{dmy(v.at)}</td>
                    <td>{v.reason || '—'}</td>
                    <td>
                      <span className={'badge ' + (v.referred ? 'b-danger' : 'b-neutral')}>{v.referred ? translate('Referred') : translate(statusLabel(v.status))}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <div className="ill">
              <Icon name="calendar" />
            </div>
            <p className="muted">{translate('No visits yet.')}</p>
          </div>
        )}
      </div>
      <div className="modal-f">
        <span className="sp" />
        <button className="btn btn-outline" onClick={onClose}>
          {translate('Close')}
        </button>
      </div>
    </Modal>
  )
}
