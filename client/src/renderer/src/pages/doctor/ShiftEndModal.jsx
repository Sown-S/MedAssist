import { useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useQueue, reviewRedFlag, inRoom } from '../../api/queueStore'
import { useDoctorShifts, doctorShiftStart, shiftReview, closeDoctorShift } from '../../api/doctorShiftStore'
import { printHtml, esc } from '../admin/inventory/shared'
import { dmy, hhmm } from '../reception/shared'
import { ReleaseModal } from './doctorShared'

const no = (t) => String(t).padStart(3, '0')
const SUMMARY = [
  ['visits', 'Visits completed'],
  ['rx', 'Prescriptions'],
  ['labs', 'Lab orders'],
  ['referred', 'Red-flag referrals']
]

// Kết thúc ca khám của bác sĩ: danh sách việc còn dở (bệnh nhân trong phòng, đang đi xét nghiệm, ca cờ đỏ chưa đánh giá)
// phải xử lý / bàn giao hết, rồi mới kết thúc ca + tổng kết ca (in được). Mở từ nút "Kết thúc ca" hoặc khi bấm Đăng xuất.
// signingOut: mở từ nút Đăng xuất → có thêm lựa chọn "Đăng xuất, chưa kết thúc ca" (VD nghỉ giữa giờ).
export default function ShiftEndModal({ signingOut = false, onClose, onOpenVisit, onSignOut }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const queue = useQueue()
  const shifts = useDoctorShifts()
  const [note, setNote] = useState('')
  const [handing, setHanding] = useState(null)

  const start = doctorShiftStart(user, shifts)
  const r = shiftReview(user, start, queue)
  const blockers = r.inRoom.length + r.labs.length + r.redFlags.length
  const t = translate

  function printSummary(rec) {
    printHtml(
      t('Shift summary'),
      `<h1>${esc(t('Shift summary'))}</h1>
      <p class="meta">${esc(t('Doctor'))}: <b>${esc(user.name)}</b> · ${esc(hhmm(rec.start))} – ${esc(hhmm(rec.end))} ${esc(dmy(rec.end))}</p>
      <table><tbody>${SUMMARY.map(([k, label]) => `<tr><td>${esc(t(label))}</td><td class="num"><b>${rec.summary[k]}</b></td></tr>`).join('')}</tbody></table>
      ${rec.note ? `<p class="meta">${esc(t('Note'))}: ${esc(rec.note)}</p>` : ''}
      <p class="meta" style="margin-top:18px;text-align:right">${esc(t('Doctor'))}<br><br><b>${esc(user.name)}</b></p>`,
      'other'
    )
  }
  function close(print) {
    const res = closeDoctorShift(user, note)
    if (!res.ok) return showToast(translate(res.error))
    if (print) printSummary(res.shift)
    showToast('Shift ended')
    onClose()
    if (signingOut) onSignOut()
  }

  const row = (v, extra) => (
    <div key={v.id} className="shift-row">
      <span className="p-ticket">{no(v.ticket)}</span>
      <span className="wait-main">
        <b>{v.name}</b>
        <small>{extra}</small>
      </span>
      <button className="btn btn-ghost btn-sm" onClick={() => setHanding(v)}>
        <Icon name="repeat" /> Return to queue
      </button>
      {inRoom(v) && (
        <button className="btn btn-primary btn-sm" onClick={() => onOpenVisit(v.id)}>
          <Icon name="stethoscope" /> Finish
        </button>
      )}
    </div>
  )

  return (
    <>
      <Modal open onClose={onClose} wide>
        <ModalHeader title={translate(signingOut ? 'Before you sign out' : 'End of shift') + ' · ' + hhmm(start) + ' – ' + hhmm(new Date().toISOString())} onClose={onClose} />
        <div className="modal-body shift-body">
          <div className={'shift-check' + (blockers ? '' : ' ok')}>
            <Icon name={blockers ? 'alert' : 'check'} />
            <span>{blockers ? translate('Hand over or finish these before ending your shift') : translate('Nothing left open — you can end your shift')}</span>
          </div>

          {r.inRoom.length > 0 && (
            <>
              <div className="section-label">In my room</div>
              {r.inRoom.map((v) => row(v, translate(v.reason)))}
            </>
          )}
          {r.labs.length > 0 && (
            <>
              <div className="section-label">Out for lab tests</div>
              {r.labs.map((v) => row(v, translate('Sent') + ' ' + hhmm(v.statusAt)))}
            </>
          )}
          {r.redFlags.length > 0 && (
            <>
              <div className="section-label">Red-flag cases waiting for a doctor</div>
              {r.redFlags.map((f) => (
                <div key={f.id} className="shift-row">
                  <Icon name="ban" />
                  <span className="wait-main">
                    <b>{f.name}</b>
                    <small>{translate(f.signs) || '—'}</small>
                  </span>
                  <button className="btn btn-sm" onClick={() => reviewRedFlag(f.id, 'referred', user)}>
                    Refer to hospital
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => reviewRedFlag(f.id, 'seen', user)}>
                    See at the clinic
                  </button>
                </div>
              ))}
            </>
          )}

          <div className="section-label">This shift</div>
          <div className="shift-sum">
            {SUMMARY.map(([k, label]) => (
              <div key={k} className={k === 'overrides' && r.summary[k] ? 'warn' : ''}>
                <b>{r.summary[k]}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Note for the next shift / clinic manager</label>
            <textarea className="doc-ta" rows="2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="modal-foot">
          {signingOut && (
            <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={onSignOut} title={translate('For a short break — your patients stay assigned to you')}>
              Sign out without ending the shift
            </button>
          )}
          <button className="btn btn-ghost" disabled={!!blockers} onClick={() => close(true)}>
            <Icon name="printer" /> End shift &amp; print
          </button>
          <button className="btn btn-primary" disabled={!!blockers} onClick={() => close(false)}>
            <Icon name="check" /> {signingOut ? translate('End shift & sign out') : translate('End shift')}
          </button>
        </div>
      </Modal>
      {handing && <ReleaseModal visit={handing} onClose={() => setHanding(null)} onDone={() => setHanding(null)} />}
    </>
  )
}
