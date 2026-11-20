import Icon from '../../../components/Icon'
import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { getRelease, approveRelease, rejectRelease } from '../../../api/knowledgeApi'
import { Empty } from '../ui'
import { errorText } from './shared'
import { ReleaseBadge, ChangeList, ctxOf, ReleaseHistory, ReleaseModal } from './releaseParts'
import { fmtDateTime } from '../../../utils/format'
import { ErrorNote } from '../../../components/DataState'

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
  }, [pending?.release_id]) // eslint-disable-line react-hooks/exhaustive-deps -- chỉ nạp lại khi đổi bản phát hành

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
      <ErrorNote>{err}</ErrorNote>
      {!pending ? (
        <div className="card">
          <Empty icon="book-open-check" title="Nothing to review" text="When the administrator submits a release, it appears here." />
        </div>
      ) : (
        <div className="card">
          <div className="card-h">
            <div>
              <h3 className="num">{pending.label}</h3>
              <span className="muted small">
                <span>Submitted</span> {fmtDateTime(pending.submitted_at)}
                {detail ? ' · ' + detail.changes.length + ' ' + translate('changes') : ''}
              </span>
            </div>
            <ReleaseBadge status={pending.status} />
          </div>
          <div className="card-b">
            {pending.description && (
              <p className="small muted" style={{ marginBottom: 10 }}>
                {pending.description}
              </p>
            )}
            <ChangeList detail={detail} ctx={ctx} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn btn-danger-outline" onClick={() => setRejecting(true)}>
                <Icon name="x" />
                {translate('Reject')}
              </button>
              <button className="btn btn-primary" disabled={!detail} onClick={() => setApproving(true)}>
                <Icon name="check" />
                {translate('Approve release')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h3>Release history</h3>
        </div>
        <div className="card-b">
          <ReleaseHistory releases={data.releases} onView={setViewing} />
        </div>
      </div>
      <ReleaseModal release={viewing} ctx={ctx} onClose={() => setViewing(null)} />

      <Modal open={approving} onClose={() => setApproving(false)}>
        <ModalHeader title={translate('Approve release') + ' ' + (pending?.label ?? '')} onClose={() => setApproving(false)} />
        <div className="modal-b">
          <div className="confirm">
            <div className="ico s">
              <Icon name="circle-check" />
            </div>
            <p>
              <span>All</span> <b className="num">{detail?.changes.length ?? 0}</b> <span>changes become active for every new AI assessment. You are recorded as the approver.</span>
            </p>
          </div>
          <ErrorNote>{err}</ErrorNote>
        </div>
        <div className="modal-f">
          <button className="btn btn-outline" onClick={() => setApproving(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => run(() => approveRelease(pending.release_id), 'Release approved and in use')}>
            Approve
          </button>
        </div>
      </Modal>

      <Modal open={rejecting} onClose={() => setRejecting(false)}>
        <ModalHeader title={translate('Reject release') + ' ' + (pending?.label ?? '')} onClose={() => setRejecting(false)} />
        <div className="modal-b">
          <p className="muted">The release goes back to the administrator with your note.</p>
          <div className="field">
            <label>
              Reason <span className="req">*</span>
            </label>
            <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="At least 3 characters" />
          </div>
          <ErrorNote>{err}</ErrorNote>
        </div>
        <div className="modal-f">
          <button className="btn btn-outline" onClick={() => setRejecting(false)}>
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
