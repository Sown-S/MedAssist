import ICDPicker from '../../../components/ICDPicker'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import AssessmentCard from '../AssessmentCard'
import { SecondaryDx } from './SecondaryDx'
import { ConfirmedSymptoms } from './ConfirmedSymptoms'
import { ReminderPanel } from './ReminderPanel'
import DateField from '../../../components/DateField'

// Tab "Khám (SOAP)": S lời kể + triệu chứng đã xác nhận + kết quả cận lâm sàng (labs), O khám, gợi ý AI,
// chẩn đoán ICD-10 chính / phụ, P hướng xử trí + hẹn tái khám.
export default function SoapPanel({ visit, d, set, tried, ai, aiDecision, decideAi }) {
  const followIn = (days) => {
    const x = new Date()
    x.setDate(x.getDate() + days)
    set({ followUp: [x.getFullYear(), x.getMonth() + 1, x.getDate()].map((n, i) => (i ? String(n).padStart(2, '0') : n)).join('-') })
  }
  return (
    <>
      <div className="field" style={{ marginBottom: 12 }}>
        <span className="lab">{translate('Symptoms confirmed at reception')}</span>
        <p className="story">
          {translate('At check-in')}: “{translate(visit.reason)}”
        </p>
        <ConfirmedSymptoms list={visit.symptoms} />
      </div>

      <AssessmentCard a={ai} decisions={aiDecision} onAccept={(c) => decideAi(c, 'accepted')} onDismiss={(c) => decideAi(c, 'dismissed')} />

      <div className="soap" style={{ marginTop: 14 }}>
        <div className="field">
          <label>
            <b>{'S'}</b>
            {translate('— Subjective · Chief complaint / reported symptoms')}
          </label>
          <textarea className="input" value={d.hpi} onChange={(e) => set({ hpi: e.target.value })} placeholder="History of present illness — onset, course, medicines already taken…" />
        </div>
        <div className="field">
          <label>
            <b>{'O'}</b>
            {translate('— Objective · Physical examination')}
          </label>
          <textarea className="input" value={d.exam} onChange={(e) => set({ exam: e.target.value })} placeholder="Findings on examination…" />
        </div>
        <div className={'field full' + (tried && !d.diagnosis.trim() ? ' invalid' : '')}>
          <label>
            {translate('Confirmed diagnosis (ICD-10 code)')}
            <span className="req">*</span>
          </label>
          <ICDPicker value={d.diagnosis} onChange={(v) => set({ diagnosis: v })} />
          <span className="msg">
            <Icon name="circle-alert" />
            {translate('Required')}
          </span>
        </div>
        <div className="field full">
          <label>{translate('Secondary diagnoses / comorbidities')}</label>
          <SecondaryDx list={d.diagnosesExtra} onChange={(diagnosesExtra) => set({ diagnosesExtra })} />
        </div>
        <div className="field full">
          <label>
            <b>{'P'}</b>
            {translate('— Plan · Treatment plan & advice')}
          </label>
          <textarea className="input" value={d.plan} onChange={(e) => set({ plan: e.target.value })} placeholder="e.g. Rest, drink plenty of water, come back if the fever lasts more than 3 days…" />
        </div>
        <div className="field">
          <label>{translate('Follow-up visit')}</label>
          <DateField value={d.followUp} onChange={(v) => set({ followUp: v })} />
          <div className="tpl">
            {[3, 7, 14, 30].map((n) => (
              <button key={n} type="button" onClick={() => followIn(n)}>
                +{n} {translate('days')}
              </button>
            ))}
            {d.followUp && (
              <button type="button" onClick={() => set({ followUp: '' })}>
                {translate('None')}
              </button>
            )}
          </div>
        </div>
        <div className="field">
          <span className="lab">{translate('Reminder (read-only)')}</span>
          <ReminderPanel visit={visit} />
        </div>
      </div>
    </>
  )
}
