import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import Icon from './Icon'
import PatientAlerts from './PatientAlerts'
import { useToast } from '../context/ToastContext'
import { translate } from '../i18n'
import { useQueue, cancelVisit, CANCEL_REASONS, syncQueue, ST } from '../api/queueStore'
import { apiGet } from '../api/client'
import * as clinic from '../api/clinicApi'
import { ticketNo } from './queuePrint'
import { vitalCheck } from './IntakeModal'
import VitalsFields from './VitalsFields'
import VitalProposals from './VitalProposals'
import SymptomPanel from './SymptomPanel'
import { normalizeVitals, vitalsToForm, vitalsFromForm } from '../api/vitals'
import { toPayload } from '../api/symptoms'
import DocumentModal from '../pages/doctor/DocumentModal'

// Quầy xử lý lượt đang chờ: sửa lượt khi bệnh nhân chuyển nặng (luật chạy lại, chỉ nâng mức) hoặc huỷ lượt (lưu lý do).

const LEVEL_LABEL = { high: 'High priority', emergency: 'Emergency' }
const symMap = (list) => Object.fromEntries((list ?? []).map((x) => [x.symptom_code, { state: x.state, source: x.source }]))

export function EditWaitingModal({ visit, onClose }) {
  const { showToast } = useToast()
  const [f, setF] = useState({
    reason: visit.reason === '—' ? '' : visit.reason,
    ...vitalsToForm(normalizeVitals(visit.vitals))
  })
  const [syms, setSyms] = useState(symMap(visit.symptoms))
  const [tried, setTried] = useState(false)
  // Hàng đợi không kèm sinh hiệu / lời kể / triệu chứng → tải lượt khám khi mở.
  // Sau check-in server chỉ cho sửa sinh hiệu (lời kể khoá); triệu chứng vẫn sửa được.
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  // Chuyển nặng lúc chờ → lễ tân chuyển tuyến lượt này (PATCH /visits/{id}/refer).
  const [referring, setReferring] = useState(false)
  const [vitalProps, setVitalProps] = useState([])
  const textLocked = visit.status !== ST.WAITING
  useEffect(() => {
    Promise.all([apiGet('/api/v1/visits/' + visit.id), clinic.getVisitSymptoms(visit.id)])
      .then(([v, list]) => {
        setF({ reason: v.free_text_description ?? v.chief_complaint ?? '', ...vitalsToForm(normalizeVitals(v.vital_signs)) })
        setSyms(symMap(list.filter((x) => x.state !== 'UNKNOWN')))
        setLoaded(true)
      })
      .catch((e) => showToast(translate(e.message), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id])
  const vit = vitalCheck(f)

  async function extract(text, { signal }) {
    await clinic.updateVisit(visit.id, { text })
    return clinic.extractSymptoms(visit.id, { signal })
  }
  // Lưu sinh hiệu (+ lời kể khi còn Waiting), triệu chứng, rồi chạy lại luật ưu tiên.
  async function saveOnServer() {
    setBusy(true)
    try {
      await clinic.updateVisit(visit.id, textLocked ? { vitals: vitalsFromForm(f) } : { text: f.reason, vitals: vitalsFromForm(f) })
      await clinic.putSymptoms(visit.id, toPayload(syms))
      const a = await clinic.triggerAssessment(visit.id)
      syncQueue()
      const level = clinic.triageOf(a.priority?.final)
      showToast(translate('Visit updated') + (level !== 'routine' ? ' · ' + translate(LEVEL_LABEL[level]) : ''))
      onClose()
    } catch (e) {
      showToast(translate(e.message), 'error')
    } finally {
      setBusy(false)
    }
  }
  function save() {
    setTried(true)
    if (vit.errors.length) return showToast(translate('Check the vital signs') + ': ' + vit.errors.map((e) => translate(e)).join('; '), 'error')
    saveOnServer()
  }
  if (referring)
    return (
      <DocumentModal
        subject={{ ...visit, signs: [f.reason.trim()].filter(Boolean).join(' — ') }}
        mode="desk"
        target={{ visitId: visit.id }}
        onDone={onClose}
        onClose={() => setReferring(false)}
      />
    )

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Edit waiting visit') + ' — ' + ticketNo(visit.ticket) + ' ' + visit.name} onClose={onClose} />
      <div className="modal-body">
        <PatientAlerts p={visit} compact />
        <div className="section-label">Symptoms</div>
        <SymptomPanel
          value={syms}
          onChange={setSyms}
          text={f.reason}
          onText={(t) => setF((x) => ({ ...x, reason: t }))}
          textLocked={textLocked}
          onExtract={extract}
          onVitals={setVitalProps}
        />
        <div className="section-label">Vital signs</div>
        <VitalProposals
          list={vitalProps}
          form={f}
          onApply={(fill) => setF((x) => ({ ...x, ...fill }))}
          onDrop={(keys) => setVitalProps((l) => l.filter((p) => !keys.includes(p.key)))}
        />
        <VitalsFields value={f} onChange={(k, v) => setF((x) => ({ ...x, [k]: v }))} errorKeys={tried ? vit.errorKeys : new Set()} />
        <p className="ai-soft" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
          <Icon name="zap" /> {translate('Condition worsened while waiting? Update the symptoms and vital signs — the priority is re-assessed when you save.')}
        </p>
        {vit.warnings.length > 0 && (
          <p className="ai-soft" style={{ color: '#FCD34D', fontSize: 12.5, margin: '4px 0 0' }}>
            <Icon name="alert" /> {translate('Unusual value — please double-check')}: {vit.warnings.map((w) => translate(w)).join(' · ')}
          </p>
        )}
      </div>
      <div className="modal-foot">
        <button
          className="btn"
          style={{ background: 'var(--warn)', color: '#fff', marginRight: 'auto' }}
          onClick={() => setReferring(true)}
          title={translate('Accident, critical condition, severe breathing difficulty… — beyond the clinic: transfer now')}
        >
          <Icon name="ban" /> Emergency — transfer now
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!loaded || busy} onClick={save}>
          <Icon name="check" /> Save
        </button>
      </div>
    </Modal>
  )
}

export function CancelVisitModal({ visit, onClose }) {
  const { showToast } = useToast()
  const { redFlags } = useQueue()
  // Ca cờ đỏ đang chờ bác sĩ đánh giá → không cho huỷ.
  const pendingFlag = redFlags.some((r) => r.visitId === visit.id && !r.doctorReview)
  const [reason, setReason] = useState('left_waiting')
  const [note, setNote] = useState('')
  async function submit() {
    const r = await cancelVisit(visit.id, { reason, note })
    if (!r.ok) return showToast(translate(r.error), 'error')
    showToast(translate('Visit cancelled') + ' — ' + ticketNo(visit.ticket))
    onClose()
  }
  return (
    <Modal open onClose={onClose}>
      <ModalHeader title={translate('Cancel visit') + ' — ' + ticketNo(visit.ticket) + ' ' + visit.name} onClose={onClose} />
      <div className="modal-body">
        <p className="ai-soft" style={{ fontSize: 13, marginTop: 0 }}>
          The visit leaves the queue and is kept as “left without finishing” with your reason. The patient record is not deleted.
        </p>
        {pendingFlag && (
          <div className="warn-banner show danger" style={{ marginBottom: 10 }}>
            <div className="icon">
              <Icon name="ban" />
            </div>
            <div className="txt">{translate('This patient has warning signs waiting for a doctor — let the doctor decide first.')}</div>
          </div>
        )}
        <div className="leave-reasons">
          {CANCEL_REASONS.map((r) => (
            <label key={r.key} className={'leave-reason' + (reason === r.key ? ' on' : '')}>
              <input type="radio" name="cancel" checked={reason === r.key} onChange={() => setReason(r.key)} /> <span>{r.label}</span>
            </label>
          ))}
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>
            Note {reason === 'other' && <span className="req">*</span>}
          </label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Said they would come back tomorrow" />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Back
        </button>
        <button className="btn btn-primary" style={{ background: 'var(--warn)' }} disabled={pendingFlag || (reason === 'other' && !note.trim())} onClick={submit}>
          <Icon name="x" /> Cancel visit
        </button>
      </div>
    </Modal>
  )
}
