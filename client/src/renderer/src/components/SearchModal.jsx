import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import PatientAlerts from './PatientAlerts'
import { usePatients, searchPatients, ageOf } from '../api/patientStore'
import { useQueue, STATUSES, isClosed, statusLabel } from '../api/queueStore'
import { translate } from '../i18n'
import { ticketNo } from './queuePrint'
import { DEMO_MODE } from '../api/client'
import { lookupPatients, getPatient } from '../api/clinicApi'

// Backend thật: tìm qua GET /patients/lookup (gõ sau 300 ms), chọn ai thì tải đủ hồ sơ (dị ứng, bệnh nền, mang thai).
function useServerSearch(q, picked) {
  const [results, setResults] = useState([])
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (DEMO_MODE) return
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
    if (DEMO_MODE || !id) return setDetail(null)
    let stop = false
    getPatient(id).then((p) => !stop && setDetail(p), () => {})
    return () => {
      stop = true
    }
  }, [id])
  return { results, detail, error }
}

// Tra cứu nhanh bệnh nhân theo TỪ KHOÁ (họ tên có/không dấu, SĐT, mã hồ sơ) rồi tiếp đón (cấp số).
// readOnly = đang mất kết nối: vẫn tra cứu được, nút tiếp đón bị khoá.
export default function SearchModal({ open, onClose, onCheckIn, readOnly }) {
  usePatients()
  const { visits } = useQueue()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setPicked(null)
  }, [open])

  const server = useServerSearch(q, picked)
  const results = DEMO_MODE ? searchPatients(q) : server.results
  const sel = DEMO_MODE ? results.find((r) => r.id === picked) ?? results[0] : server.detail
  const todayOf = (p) => [...visits].reverse().find((v) => v.patientId === p.id)
  const today = sel && todayOf(sel)
  const busy = today && !isClosed(today)

  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHeader title="Find patient" onClose={onClose} />
      <input
        className="pl-search"
        type="search"
        autoFocus
        placeholder="Name, phone number or record ID…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPicked(null)
        }}
      />
      <div className="pl-grid">
        <div className="pl-results">
          {results.map((r) => {
            const v = todayOf(r)
            return (
              <button key={r.id} className={'pl-row' + (r.id === sel?.id ? ' active' : '')} onClick={() => setPicked(r.id)}>
                <span className="nm">{r.name}</span>
                <span className="sub">
                  <span className="mono">{r.code ?? r.id}</span> · {r.dob} · <span className="mono">{r.phone}</span>
                </span>
                {v && !isClosed(v) && <span className="pl-today">{ticketNo(v.ticket)}</span>}
              </button>
            )
          })}
          {server.error && <p className="ai-soft" style={{ fontSize: 13.5, padding: 10 }}>{server.error}</p>}
          {q.trim() && !results.length && !server.error && <p className="ai-soft" style={{ fontSize: 13.5, padding: 10 }}>No patient matches. Register them as a new patient.</p>}
          {!q.trim() && <p className="ai-soft" style={{ fontSize: 13.5, padding: 10 }}>Type at least part of a name, phone number or record ID.</p>}
        </div>
        <div className="pl-detail">
          {sel ? (
            <>
              <h3>{sel.name}</h3>
              <div className="pl-summary">
                <span className="mono">{sel.code ?? sel.id}</span>
                <span>{translate(sel.gender)}</span>
                <span>
                  {sel.dob} ({ageOf(sel.dob)} {translate('yrs')})
                </span>
                <span className="mono">{sel.phone}</span>
              </div>
              <PatientAlerts p={sel} />
              {today && (
                <p className="pl-status">
                  {translate('Today')}: {translate('no.')} <b>{ticketNo(today.ticket)}</b> · {translate(statusLabel(today.status))}
                </p>
              )}
              <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={readOnly || busy} onClick={() => onCheckIn(sel)}>
                {busy ? 'Already in today’s queue' : 'Check in & issue number'}
              </button>
            </>
          ) : (
            <p className="ai-soft" style={{ fontSize: 13.5 }}>Select a patient to see their details.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
