import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { getRelease, approveRelease, rejectRelease } from '../../../api/knowledgeApi'
import { Empty } from '../ui'
import { errorText } from './shared'
import { ReleaseBadge, ChangeList, ctxOf, ReleaseHistory, ReleaseModal } from './releaseParts'
import { shortDateTime } from '../../../lib/format'

// Bác sĩ: duyệt bản chờ duyệt
export function ReviewPanel({ data, names, onChanged }) {
  const { showToast } = useToast()
  const pending = data.releases.find((r) => r.status === 'PendingApproval')
  const [detail, setDetail] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [viewing, setViewing] = useState(null)
  const ctx = ctxOf(data, names)

  useEffect(() => {
    setDetail(null)
    if (pending) getRelease(pending.release_id).then(setDetail, (e) => setErr(errorText(e)))
  }, [pending?.release_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn, ok) {
    setErr('')
    try {
      await fn()
      setRejecting(false)
      setApproving(false)
      showToast(translate(ok))
      onChanged()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  return (
    <>
      {err && <div className="kb-error">{err}</div>}
      {!pending ? (
        <div className="card">
          <Empty icon="check" title="Nothing to review" text="When the administrator submits a release, it appears here." />
        </div>
      ) : (
        <div className="card kb-release">
          <div className="ai-toolbar">
            <div>
              <div className="card-title">
                <span className="mono">{pending.label}</span> <ReleaseBadge status={pending.status} />
              </div>
              {pending.description && <div className="ai-small ai-soft">{pending.description}</div>}
              <div className="ai-small ai-soft">
                <span>Submitted</span> {shortDateTime(pending.submitted_at)}
              </div>
            </div>
            <div className="ai-toolbar-right">
              <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(true)}>
                Reject
              </button>
              <button className="btn btn-primary btn-sm" disabled={!detail} onClick={() => setApproving(true)}>
                Approve release
              </button>
            </div>
          </div>
          <p className="ai-small ai-soft">Review every change below. Approving activates the whole release at once for all new AI assessments.</p>
          <ChangeList detail={detail} ctx={ctx} />
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Release history</div>
        <ReleaseHistory releases={data.releases} onView={setViewing} />
      </div>
      <ReleaseModal release={viewing} ctx={ctx} onClose={() => setViewing(null)} />

      <Modal open={approving} onClose={() => setApproving(false)}>
        <ModalHeader title={translate('Approve release') + ' ' + (pending?.label ?? '')} onClose={() => setApproving(false)} />
        <div className="modal-body">
          <p className="ai-confirm-msg">
            <span>All</span> <b className="mono">{detail?.changes.length ?? 0}</b> <span>changes become active for every new AI assessment. You are recorded as the approver.</span>
          </p>
          {err && <div className="kb-error">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => setApproving(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => run(() => approveRelease(pending.release_id), 'Release approved and in use')}>
            Approve
          </button>
        </div>
      </Modal>

      <Modal open={rejecting} onClose={() => setRejecting(false)}>
        <ModalHeader title={translate('Reject release') + ' ' + (pending?.label ?? '')} onClose={() => setRejecting(false)} />
        <div className="modal-body">
          <p className="ai-soft">The release goes back to the administrator with your note.</p>
          <div className="field">
            <label>
              Reason <span className="ai-req">*</span>
            </label>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="At least 3 characters" />
          </div>
          {err && <div className="kb-error">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => setRejecting(false)}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            disabled={note.trim().length < 3}
            onClick={() => run(() => rejectRelease(pending.release_id, note.trim()), 'Release returned to the administrator').then(() => setNote(''))}
          >
            Reject
          </button>
        </div>
      </Modal>
    </>
  )
}
