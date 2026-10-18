import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import PatientAlerts from './PatientAlerts'
import { usePatients, searchPatients, ageOf } from '../api/patientStore'
import { useQueue, STATUSES, isClosed, statusLabel } from '../api/queueStore'
import { translate } from '../i18n'
import { ticketNo } from './queuePrint'

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

  const results = searchPatients(q)
  const sel = results.find((r) => r.id === picked) ?? results[0]
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
                  <span className="mono">{r.id}</span> · {r.dob} · <span className="mono">{r.phone}</span>
                </span>
                {v && !isClosed(v) && <span className="pl-today">{ticketNo(v.ticket)}</span>}
              </button>
            )
          })}
          {q.trim() && !results.length && <p className="ai-soft" style={{ fontSize: 13.5, padding: 10 }}>No patient matches. Register them as a new patient.</p>}
          {!q.trim() && <p className="ai-soft" style={{ fontSize: 13.5, padding: 10 }}>Type at least part of a name, phone number or record ID.</p>}
        </div>
        <div className="pl-detail">
          {sel ? (
            <>
              <h3>{sel.name}</h3>
              <div className="pl-summary">
                <span className="mono">{sel.id}</span>
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
