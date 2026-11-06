import ICDPicker from '../../../components/ICDPicker'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import AssessmentCard from '../AssessmentCard'
import { SecondaryDx } from './SecondaryDx'
import { ConfirmedSymptoms } from './ConfirmedSymptoms'

// Tab "Khám (SOAP)": S lời kể + triệu chứng đã xác nhận + kết quả cận lâm sàng (labs), O khám, gợi ý AI,
// chẩn đoán ICD-10 chính / phụ, P hướng xử trí + hẹn tái khám.
export default function SoapPanel({ visit, d, set, tried, ai, aiDecision, decideAi, labs }) {
  const followIn = (days) => {
    const x = new Date()
    x.setDate(x.getDate() + days)
    set({ followUp: [x.getFullYear(), x.getMonth() + 1, x.getDate()].map((n, i) => (i ? String(n).padStart(2, '0') : n)).join('-') })
  }
  return (
    <div className="ipanel active">
      <div className="section-label">S — Subjective · Chief complaint / reported symptoms</div>
      <div className="symptom-box">
        <small className="ai-soft">{translate('At check-in')}:</small> {translate(visit.reason)}
        <ConfirmedSymptoms list={visit.symptoms} />
      </div>
      <textarea
        className="doc-ta"
        rows="2"
        style={{ marginTop: 6 }}
        value={d.hpi}
        onChange={(e) => set({ hpi: e.target.value })}
        placeholder="History of present illness — onset, course, medicines already taken…"
      />
      {labs}

      <div className="section-label">O — Objective · Physical examination</div>
      <textarea className="doc-ta" rows="3" value={d.exam} onChange={(e) => set({ exam: e.target.value })} placeholder="Findings on examination…" />

      <AssessmentCard a={ai} decisions={aiDecision} onAccept={(c) => decideAi(c, 'accepted')} onDismiss={(c) => decideAi(c, 'dismissed')} />

      <div className="section-label">
        Confirmed diagnosis (ICD-10 code) <span className="req">*</span>
      </div>
      <div className={tried && !d.diagnosis.trim() ? 'field-error' : ''}>
        <ICDPicker value={d.diagnosis} onChange={(v) => set({ diagnosis: v })} />
      </div>
      <SecondaryDx list={d.diagnosesExtra} onChange={(diagnosesExtra) => set({ diagnosesExtra })} />

      <div className="section-label">P — Plan · Treatment plan &amp; advice</div>
      <textarea className="doc-ta" rows="2" value={d.plan} onChange={(e) => set({ plan: e.target.value })} placeholder="e.g. Rest, drink plenty of water, come back if the fever lasts more than 3 days…" />
      <div className="follow-up">
        <label>
          <Icon name="calendar" /> <span>Follow-up visit</span>
        </label>
        <input type="date" value={d.followUp} onChange={(e) => set({ followUp: e.target.value })} />
        {[3, 7, 14, 30].map((n) => (
          <button key={n} className="chip-btn" onClick={() => followIn(n)}>
            +{n} {translate('days')}
          </button>
        ))}
        {d.followUp && (
          <button className="chip-btn" onClick={() => set({ followUp: '' })}>
            <Icon name="x" /> <span>None</span>
          </button>
        )}
      </div>
    </div>
  )
}
