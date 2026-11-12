import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import Modal, { ModalHeader } from '../../components/Modal'
import { ageOf } from '../../api/patient'
import { statusLabel } from '../../api/queueStore'
import { translate } from '../../i18n'
import { listPatients, lookupPatients, getPatient, patientVisits } from '../../api/clinicApi'
import { dmy } from './shared'

const PAGE = 20

// Trang Bệnh nhân của Lễ tân: danh sách mọi hồ sơ (GET /patients), tìm nhanh bằng một ô (GET /patients/lookup),
// xem lịch sử khám (GET /patients/{id}/visits) và tiếp đón lại.
export default function PatientsView({ readOnly, onCheckIn }) {
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState({ total: 0, items: [] })
  const [status, setStatus] = useState('loading')
  const [history, setHistory] = useState(null)

  useEffect(() => {
    let stop = false
    setStatus('loading')
    const term = q.trim()
    const t = setTimeout(
      () => {
        const req = term ? lookupPatients(term, 50).then((items) => ({ total: items.length, items })) : listPatients({ limit: PAGE, offset })
        req.then(
          (r) => !stop && (setData(r), setStatus('ready')),
          () => !stop && setStatus('failed')
        )
      },
      term ? 300 : 0
    )
    return () => {
      stop = true
      clearTimeout(t)
    }
  }, [q, offset])

  async function checkIn(p) {
    const full = await getPatient(p.id).catch(() => p)
    onCheckIn(full)
  }

  const from = data.total ? offset + 1 : 0
  const to = q.trim() ? data.items.length : Math.min(offset + PAGE, data.total)

  return (
    <div className="card">
      <div className="pt-filters">
        <div className="ai-search">
          <Icon name="search" />
          <input
            type="search"
            value={q}
            onChange={(e) => (setQ(e.target.value), setOffset(0))}
            placeholder={translate('Name, phone, ID number, record code or year of birth')}
            aria-label={translate('Search patients')}
          />
        </div>
      </div>
      {status === 'failed' && <p className="sym-warn">{translate('Could not load the patient list from the server.')}</p>}
      <table className="dt">
        <thead>
          <tr>
            <th>Record code</th>
            <th>Patient</th>
            <th>Date of birth</th>
            <th>Phone</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.items.map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.code}</td>
              <td>
                <b className="pt-name">{p.name}</b>
                <small className="pt-sub">
                  {translate(p.gender)} · {ageOf(p.dob)} {translate('yrs')}
                </small>
              </td>
              <td className="mono">{p.dob}</td>
              <td className="mono">{p.phone || '—'}</td>
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
              <td colSpan="5" className="ai-soft">
                {q.trim() ? translate('No matching patient.') : translate('No patient records yet.')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="pt-pager">
        <span>
          {translate('Showing')} {from}–{to} / {data.total}
        </span>
        {!q.trim() && (
          <span className="pt-pager-btns">
            <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              <Icon name="arrowLeft" /> Previous
            </button>
            <button className="btn btn-ghost btn-sm" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
              Next <Icon name="chevronRight" />
            </button>
          </span>
        )}
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
                  <td className="mono">{dmy(v.at)}</td>
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
