import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import Icon from './Icon'
import PatientAlerts from './PatientAlerts'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { translate } from '../i18n'
import { useQueue, updateWaitingVisit, cancelVisit, recordRedFlag, CANCEL_REASONS, syncQueue, ST } from '../api/queueStore'
import { DEMO_MODE, apiGet } from '../api/client'
import * as clinic from '../api/clinicApi'
import { ticketNo } from './queuePrint'
import { vitalCheck } from './IntakeModal'
import VitalsFields from './VitalsFields'
import VitalProposals from './VitalProposals'
import SymptomPanel from './SymptomPanel'
import { normalizeVitals, vitalsToForm, vitalsFromForm, RULE_KEY_TO_VITAL } from '../api/vitals'
import { toPayload } from '../api/symptoms'
import { triage, TRIAGE_LEVELS, missingLabel } from '../api/triage'
import { useAIConfig } from '../api/aiConfigStore'
import DocumentModal from '../pages/doctor/DocumentModal'

// Quầy xử lý lượt ĐANG CHỜ khám (sau khi đã tiếp đón):
//  - Sửa lượt: bệnh nhân chuyển nặng → đo lại sinh hiệu, cập nhật triệu chứng, bật ưu tiên; luật chạy lại và chỉ NÂNG mức;
//  - Huỷ lượt: bệnh nhân về trước khi được gọi / tiếp đón nhầm, trùng lượt (không xoá, lưu lý do + nhật ký).

const symMap = (list) => Object.fromEntries((list ?? []).map((x) => [x.symptom_code, { state: x.state, source: x.source }]))

export function EditWaitingModal({ visit, onClose }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  useAIConfig()
  const [f, setF] = useState({
    reason: visit.reason === '—' ? '' : visit.reason,
    days: visit.days ?? '',
    ...vitalsToForm(normalizeVitals(visit.vitals))
  })
  const [syms, setSyms] = useState(symMap(visit.symptoms))
  const [tried, setTried] = useState(false)
  // Backend thật: hàng đợi không kèm sinh hiệu / lời kể / triệu chứng → tải lượt khám khi mở.
  // Sau check-in server chỉ cho sửa sinh hiệu (lời kể khoá); triệu chứng vẫn sửa được.
  const [loaded, setLoaded] = useState(DEMO_MODE)
  const [busy, setBusy] = useState(false)
  // Backend thật: chuyển nặng lúc chờ → lễ tân chuyển tuyến lượt này (PATCH /visits/{id}/refer, ERD v2.0).
  const [referring, setReferring] = useState(false)
  // Sinh hiệu đọc được trong lời kể — chờ y tá xác nhận, không ghi đè số đã nhập.
  const [vitalProps, setVitalProps] = useState([])
  const textLocked = !DEMO_MODE && visit.status !== ST.WAITING
  useEffect(() => {
    if (DEMO_MODE) return
    Promise.all([apiGet('/api/v1/visits/' + visit.id), clinic.getVisitSymptoms(visit.id)])
      .then(([v, list]) => {
        setF({ reason: v.free_text_description ?? v.chief_complaint ?? '', days: '', ...vitalsToForm(normalizeVitals(v.vital_signs)) })
        setSyms(symMap(list.filter((x) => x.state !== 'UNKNOWN')))
        setLoaded(true)
      })
      .catch((e) => showToast(translate(e.message)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id])
  const vit = vitalCheck(f)
  const states = Object.fromEntries(Object.entries(syms).map(([k, x]) => [k, x.state]))
  const tri = triage({ states, age: visit.age, days: f.days, vitals: vitalsFromForm(f) })
  const askSymptoms = tri.needNow.filter((k) => k.startsWith('sym:')).map((k) => k.slice(4))
  const askVitals = new Set(tri.needNow.map((k) => RULE_KEY_TO_VITAL[k]).filter(Boolean))
  const payload = () => ({
    reason: f.reason,
    days: f.days,
    vitals: vitalsFromForm(f),
    symptoms: toPayload(syms),
    // Lễ tân không tự nâng ưu tiên: luật đánh giá lại khi lưu (backend: PUT /symptoms rồi POST /assessment).
    priority: !!visit.priority,
    triage: tri.level,
    triageRules: [...tri.red, ...tri.high].map((x) => x.rule.id)
  })

  async function extract(text, { signal }) {
    await clinic.updateVisit(visit.id, { text })
    return clinic.extractSymptoms(visit.id, { signal })
  }
  // Backend thật: lưu sinh hiệu (+ lời kể khi còn Waiting), triệu chứng, rồi chạy lại luật ưu tiên (POST /assessment).
  async function saveReal() {
    setBusy(true)
    try {
      await clinic.updateVisit(visit.id, textLocked ? { vitals: vitalsFromForm(f) } : { text: f.reason, vitals: vitalsFromForm(f) })
      await clinic.putSymptoms(visit.id, toPayload(syms))
      const a = await clinic.triggerAssessment(visit.id)
      syncQueue()
      const level = clinic.triageOf(a.priority?.final)
      showToast(translate('Visit updated') + (level !== 'routine' ? ' · ' + translate(TRIAGE_LEVELS[level].label) : ''))
      onClose()
    } catch (e) {
      showToast(translate(e.message))
    } finally {
      setBusy(false)
    }
  }
  function save() {
    setTried(true)
    if (vit.errors.length) return showToast(translate('Check the vital signs') + ': ' + vit.errors.map((e) => translate(e)).join('; '))
    if (!DEMO_MODE) return saveReal()
    const r = updateWaitingVisit(visit.id, payload(), user)
    if (!r.ok) return showToast(translate(r.error))
    showToast('Visit updated')
    onClose()
  }
  // Chuyển nặng trong lúc chờ: CẤP CỨU vượt khả năng phòng khám → chuyển viện / gọi 115 NGAY, lượt khám đóng; bác sĩ được báo.
  function redFlag(outcome) {
    updateWaitingVisit(visit.id, { ...payload(), priority: true }, user)
    recordRedFlag(
      {
        id: visit.patientId,
        name: visit.name,
        gender: visit.gender,
        age: visit.age,
        allergies: visit.allergies,
        history: visit.history,
        signs: [f.reason.trim(), ...tri.red.map((x) => x.rule.rationale)].filter(Boolean).join(' — '),
        visitId: visit.id
      },
      user,
      outcome
    )
    showToast('Emergency transfer recorded — send the patient to hospital / call 115 now; doctors have been alerted')
    onClose()
  }
  const lv = TRIAGE_LEVELS[tri.level]

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
          ask={DEMO_MODE ? askSymptoms : []}
          textLocked={textLocked}
          onExtract={DEMO_MODE ? undefined : extract}
          onVitals={setVitalProps}
        />
        <div className="section-label">Vital signs</div>
        <VitalProposals
          list={vitalProps}
          form={f}
          onApply={(fill) => setF((x) => ({ ...x, ...fill }))}
          onDrop={(keys) => setVitalProps((l) => l.filter((p) => !keys.includes(p.key)))}
        />
        <VitalsFields value={f} onChange={(k, v) => setF((x) => ({ ...x, [k]: v }))} errorKeys={tried ? vit.errorKeys : new Set()} highlight={askVitals} />
        {DEMO_MODE && (
        <div className={'triage-strip ' + tri.level}>
          <span className={'badge ' + lv.tone}>{translate(lv.label)}</span>
          <div className="txt">
            {tri.red.map((x) => (
              <span key={x.rule.id}>
                <b>{translate('Red flag')}</b> · {x.rule.rationale}
              </span>
            ))}
            {tri.high.map((x) => (
              <span key={x.rule.id}>
                <b>{translate('Priority')}</b> · {x.rule.rationale}
              </span>
            ))}
            {tri.needNow.length > 0 && (
              <span className="need">
                {translate('Measure / ask now')}: {tri.needNow.map((k) => translate(missingLabel(k))).join(', ')}
              </span>
            )}
            <span className="ai-soft">{translate('The priority can only be raised here, never lowered.')}</span>
          </div>
        </div>
        )}
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
          onClick={() => (DEMO_MODE ? redFlag('referred') : setReferring(true))}
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
  const { user } = useAuth()
  const { showToast } = useToast()
  const { redFlags } = useQueue()
  // Đang có ca cờ đỏ chờ bác sĩ đánh giá → không cho huỷ (bác sĩ quyết định trước).
  const pendingFlag = redFlags.some((r) => r.visitId === visit.id && !r.doctorReview)
  const [reason, setReason] = useState('left_waiting')
  const [note, setNote] = useState('')
  async function submit() {
    const r = await cancelVisit(visit.id, { reason, note }, user)
    if (!r.ok) return showToast(translate(r.error))
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
