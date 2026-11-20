import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import PatientAlerts from './PatientAlerts'
import Icon from './Icon'
import { ageOf } from '../api/patient'
import { useQueue, isClosed, statusLabel } from '../api/queueStore'
import { translate } from '../i18n'
import { ticketNo } from './queuePrint'
import { lookupPatients, getPatient } from '../api/clinicApi'
import { ErrorNote } from './DataState'

// Tìm qua GET /patients/lookup (gõ xong 300 ms), chọn ai thì tải đủ hồ sơ.
function useServerSearch(q, picked) {
  const [results, setResults] = useState([])
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const term = q.trim()
    if (!term) return setResults([])
    let stop = false
    const t = setTimeout(() => {
      lookupPatients(term)
        .then((r) => !stop && (setResults(r), setError('')))
        .catch((e) => !stop && setError(e.message))
    }, 300)
    return () => {
      stop = true
      clearTimeout(t)
    }
  }, [q])
  const id = picked ?? results[0]?.id
  useEffect(() => {
    if (!id) return setDetail(null)
    let stop = false
    getPatient(id).then((p) => !stop && setDetail(p), () => {})
    return () => {
      stop = true
    }
  }, [id])
  return { results, detail, error }
}

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

// readOnly = mất kết nối: vẫn tra cứu được, nút tiếp đón bị khoá.
export default function SearchModal({ open, onClose, onCheckIn, readOnly }) {
  const { visits } = useQueue()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setPicked(null)
  }, [open])

  const server = useServerSearch(q, picked)
  const results = server.results
  const sel = server.detail
  // Hàng chờ có cả lượt đã kết thúc hôm nay → ưu tiên lượt còn mở.
  const todayOf = (p) => visits.find((v) => v.patientId === p.id && !isClosed(v)) ?? [...visits].reverse().find((v) => v.patientId === p.id)
  const today = sel && todayOf(sel)
  const busy = today && !isClosed(today)

  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHeader title="Find patient" onClose={onClose} />
      <div className="modal-b flush">
        <div className="srch">
          <div>
            <div className="search w-full mb-10">
              <Icon name="search" />
              <input
                className="input"
                type="search"
                autoFocus
                placeholder={translate('Name, phone number or record ID…')}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPicked(null)
                }}
                onKeyDown={(e) => {
                  // ↓ từ ô tìm: xuống kết quả đầu tiên; Enter: tiếp đón người đang chọn.
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    e.currentTarget.closest('.srch')?.querySelector('.sr')?.focus()
                  } else if (e.key === 'Enter' && sel && !readOnly && !busy) {
                    e.preventDefault()
                    onCheckIn(sel)
                  }
                }}
              />
            </div>
            {results.map((r) => {
              const v = todayOf(r)
              return (
                <button
                  key={r.id}
                  type="button"
                  className={'sr' + (r.id === sel?.id ? ' on' : '')}
                  onClick={() => setPicked(r.id)}
                  onFocus={() => setPicked(r.id)}
                  onDoubleClick={() => sel?.id === r.id && !readOnly && !busy && onCheckIn(sel)}
                  onKeyDown={(e) => {
                    // Enter trên kết quả đang chọn (đã tải xong chi tiết) = Tiếp đón & cấp số.
                    if (e.key === 'Enter' && sel?.id === r.id && !readOnly && !busy) {
                      e.preventDefault()
                      onCheckIn(sel)
                    }
                  }}
                >
                  <span className="ava">{initials(r.name)}</span>
                  <span className="t">
                    <b>{r.name}</b>
                    <span>
                      <span className="num">{r.code ?? r.id}</span> · {r.dob} · <span className="num">{r.phone}</span>
                    </span>
                  </span>
                  {v && !isClosed(v) && <span className="badge b-info">{ticketNo(v.ticket)}</span>}
                </button>
              )
            })}
            <ErrorNote>{server.error}</ErrorNote>
            {q.trim() && !results.length && !server.error && <p className="muted small p-10">No patient matches. Register them as a new patient.</p>}
            {!q.trim() && <p className="muted small p-10">Type at least part of a name, phone number or record ID.</p>}
          </div>
          <div>
            {sel ? (
              <>
                <b className="fs-md">{sel.name}</b>
                <div className="muted small">
                  <span className="num">{sel.code ?? sel.id}</span> · {sel.dob} ({ageOf(sel.dob)} {translate('yrs')}) · {translate(sel.gender)} · <span className="num">{sel.phone}</span>
                </div>
                <div style={{ margin: '12px 0' }}>
                  <PatientAlerts p={sel} />
                </div>
                {today && (
                  <div className="muted small">
                    {translate('Today')}: {translate('no.')} <b>{ticketNo(today.ticket)}</b> · {translate(statusLabel(today.status))}
                  </div>
                )}
                <button className="btn btn-primary mt-14" disabled={readOnly || busy} onClick={() => onCheckIn(sel)}>
                  <Icon name="clipboard-plus" />
                  {busy ? translate('Already in today’s queue') : translate('Check in & issue number')}
                </button>
              </>
            ) : (
              <div className="empty">
                <div className="ill">
                  <Icon name="user-search" />
                </div>
                <p className="muted small">{translate('Select a patient to see their details.')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="modal-f">
        <span className="muted small">{translate('Not found? Register them as a new patient.')}</span>
        <span className="sp" />
        <button className="btn btn-outline" disabled={readOnly} onClick={() => onCheckIn(null)}>
          <Icon name="user-plus" />
          {translate('Register new patient')}
        </button>
      </div>
    </Modal>
  )
}
