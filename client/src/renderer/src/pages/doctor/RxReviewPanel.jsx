import { useState } from 'react'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useQueue, isMine, recallVisit, ST } from '../../api/queueStore'
import { invoiceById } from '../../api/invoiceStore'
import { usePatients } from '../../api/patientStore'
import { useAIConfig } from '../../api/aiConfigStore'
import { useRxReviews, addReview, reviewsOf, VERDICTS, verdictOf } from '../../api/rxReviewStore'
import { dmy, hhmm } from '../reception/shared'
import { DEMO_MODE } from '../../api/client'

// Bác sĩ xem lại một đơn ĐÃ CHỐT: kiểm tra lại với hồ sơ hiện tại (dị ứng / bệnh nền có thể đã đổi),
// ghi đánh giá (phù hợp / cần điều chỉnh / lo ngại an toàn). Đơn đã chốt không sửa tại chỗ:
//  - lễ tân CHƯA lập hoá đơn → bác sĩ kê đơn được thu hồi đơn về phòng khám để sửa;
//  - đã thu tiền / đã xuất thuốc → ghi "cần điều chỉnh", hệ thống nhắc khi bệnh nhân vào phòng khám lần sau.
export default function RxReviewPanel({ visit, onRecalled }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { visits } = useQueue()
  const patients = usePatients()
  const all = useRxReviews()
  useAIConfig()
  const [verdict, setVerdict] = useState('ok')
  const [note, setNote] = useState('')

  const live = visits.find((v) => v.id === visit.id)
  const current = patients.find((p) => p.id === visit.patientId)
  const record = { age: visit.age, allergies: current?.allergies ?? visit.allergies, history: current?.history ?? visit.history }
  const changed = current && ((current.allergies ?? '') !== (visit.allergies ?? '') || (current.history ?? '') !== (visit.history ?? ''))
  const reviews = reviewsOf(visit.id, all)
  const inv = live?.invoiceId && invoiceById(live.invoiceId)
  // Mở lại đơn (reopen): chưa thu tiền và chưa cấp thuốc nào — hoàn kho, huỷ hoá đơn pending.
  const recallable = live?.status === ST.PRESCRIBED && isMine(live, user) && inv?.status !== 'paid' && !(live.rx ?? []).some((l) => l.dispense_status === 'Dispensed')

  function save() {
    const r = addReview(visit, { verdict, note }, user)
    if (!r.ok) return showToast(translate(r.error))
    setNote('')
    setVerdict('ok')
    showToast(verdict === 'ok' ? 'Review saved' : 'Review saved — you will be reminded at this patient’s next visit')
  }
  async function recall() {
    const r = await recallVisit(visit.id, user)
    if (!r.ok) return showToast(translate(r.error))
    showToast('Prescription recalled — edit it in the consultation room')
    onRecalled(visit.id)
  }

  return (
    <div className="rx-review">
      <div className="section-label">Re-check against the current patient record</div>
      {changed && (
        <p className="ai-soft" style={{ fontSize: 12.5, margin: '0 0 6px', color: '#FCD34D' }}>
          <Icon name="alert" /> <span>Allergies or chronic conditions have changed since this prescription was written.</span>
        </p>
      )}
      <p className="ai-soft" style={{ fontSize: 12.5, margin: '0 0 6px' }}>
        {translate('Drug allergies')}: {record.allergies ? <b>{translate(record.allergies)}</b> : translate('none recorded')} · {translate('Chronic conditions')}:{' '}
        {record.history ? translate(record.history) : translate('none recorded')}
        <br />
        <span>The system does not check drug interactions, doses or duplicate prescriptions — the doctor is responsible for reviewing the prescription.</span>
      </p>

      {/* Chạy thật: chưa có trong FR / ERD nên không có API đánh giá đơn → chỉ còn thu hồi đơn (PATCH …/prescription/reopen). */}
      {!DEMO_MODE && user.roleKey === 'doctor' && recallable && (
        <div className="rx-review-actions">
          <button className="btn btn-ghost btn-sm" onClick={recall} title={translate('Reception has not invoiced this visit yet')}>
            <Icon name="repeat" /> Recall to edit (not yet paid)
          </button>
        </div>
      )}

      {DEMO_MODE && (
      <>
      <div className="section-label">
        Reviews <span className="itab-cnt">{reviews.length}</span>
      </div>
      {reviews.map((r) => (
        <div key={r.id} className="rx-review-item">
          <span className={'badge ' + verdictOf(r.verdict).tone}>{translate(verdictOf(r.verdict).label)}</span>
          <span className="ai-soft mono">
            {dmy(r.at)} {hhmm(r.at)}
          </span>
          <span className="ai-soft">· {r.by}</span>
          {r.resolved && <span className="badge muted">{translate('Handled') + ' ' + dmy(r.resolved.at)}</span>}
          {r.note && <p>{r.note}</p>}
        </div>
      ))}
      {!reviews.length && <p className="ai-soft" style={{ fontSize: 12.5, margin: 0 }}>No reviews yet.</p>}

      {user.roleKey === 'doctor' && (
        <div className="rx-review-form">
          <div className="rx-review-verdicts">
            {VERDICTS.map((v) => (
              <button key={v.key} className={'chip-btn' + (verdict === v.key ? ' on ' + v.tone : '')} onClick={() => setVerdict(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
          <textarea
            className="doc-ta"
            rows="2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={verdict === 'ok' ? 'Note (optional)' : 'What should change, e.g. lower the Ibuprofen dose, switch to Paracetamol…'}
          />
          <div className="rx-review-actions">
            {recallable ? (
              <button className="btn btn-ghost btn-sm" onClick={recall} title={translate('Reception has not invoiced this visit yet')}>
                <Icon name="repeat" /> Recall to edit (not yet paid)
              </button>
            ) : (
              <span className="ai-soft" style={{ fontSize: 12, marginRight: 'auto' }}>
                Finalized prescriptions are locked. Record “Needs adjustment” and prescribe again at the next visit.
              </span>
            )}
            <button className="btn btn-primary btn-sm" onClick={save}>
              <Icon name="check" /> Save review
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
