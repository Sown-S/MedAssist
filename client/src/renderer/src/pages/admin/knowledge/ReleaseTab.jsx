import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { getRelease, createRelease, submitRelease, dropDraft, OPEN_STATUSES } from '../../../api/knowledgeApi'
import { Empty } from '../ui'
import { errorText } from './shared'
import { ReleaseBadge, ChangeList, ctxOf, ReleaseHistory, ReleaseModal } from './releaseParts'

function nextLabel(releases) {
  const y = new Date().getFullYear()
  const n = releases
    .map((r) => r.label.match(new RegExp(`^KB-${y}\\.(\\d+)$`))?.[1])
    .filter(Boolean)
    .map(Number)
  return `KB-${y}.${String((n.length ? Math.max(...n) : 0) + 1).padStart(2, '0')}`
}

// Admin: bản phát hành đang soạn + lịch sử
export default function ReleaseTab({ data, names, onChanged, autoCreate }) {
  const { showToast } = useToast()
  const open = data.releases.find((r) => OPEN_STATUSES.includes(r.status))
  const [detail, setDetail] = useState(null)
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [err, setErr] = useState('')
  const ctx = ctxOf(data, names)

  useEffect(() => {
    setDetail(null)
    if (open) getRelease(open.release_id).then(setDetail, (e) => setErr(errorText(e)))
  }, [open?.release_id, open?.status, data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (autoCreate && !open) setCreating(true)
  }, [autoCreate]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn, ok) {
    setErr('')
    try {
      await fn()
      showToast(translate(ok))
      onChanged()
    } catch (e) {
      setErr(errorText(e))
    }
  }

  return (
    <>
      {err && <div className="kb-error">{err}</div>}
      {!open ? (
        <div className="kb-release-empty">
          <Empty icon="folder" title="No release is being drafted" text="Open a release to group your changes; a doctor approves the whole release at once." />
          <div style={{ textAlign: 'center' }}>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              + Open a release
            </button>
          </div>
        </div>
      ) : (
        <div className="card kb-release">
          <div className="ai-toolbar">
            <div>
              <div className="card-title">
                <span className="mono">{open.label}</span> <ReleaseBadge status={open.status} />
              </div>
              {open.description && <div className="ai-small ai-soft">{open.description}</div>}
            </div>
            {open.status === 'Draft' && (
              <button
                className="btn btn-primary btn-sm"
                disabled={!detail?.changes.length}
                onClick={() => run(() => submitRelease(open.release_id), 'Sent to the doctor for approval')}
              >
                Submit for doctor review
              </button>
            )}
          </div>
          {open.status === 'Draft' && open.review_note && (
            <div className="kb-banner warn">
              <Icon name="alert" />
              <span>
                <b>Returned by the doctor:</b> {open.review_note}
              </span>
            </div>
          )}
          {open.status === 'PendingApproval' && (
            <div className="kb-banner">
              <Icon name="clock" />
              <span>Waiting for a doctor (not the author) to approve or reject. Changes are locked meanwhile.</span>
            </div>
          )}
          <ChangeList
            detail={detail}
            ctx={ctx}
            onDrop={open.status === 'Draft' ? (c) => run(() => dropDraft(c.kind, c.key), 'Removed from the release') : null}
          />
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Release history</div>
        <ReleaseHistory releases={data.releases} onView={setViewing} />
      </div>

      <CreateReleaseModal
        open={creating}
        suggested={nextLabel(data.releases)}
        onClose={() => setCreating(false)}
        onCreate={(label, desc) =>
          createRelease(label, desc).then(() => {
            setCreating(false)
            showToast(translate('Release opened'))
            onChanged()
          })
        }
      />
      <ReleaseModal release={viewing} ctx={ctx} onClose={() => setViewing(null)} />
    </>
  )
}

function CreateReleaseModal({ open, suggested, onClose, onCreate }) {
  const [label, setLabel] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    if (open) {
      setLabel(suggested)
      setDesc('')
      setErr('')
    }
  }, [open, suggested])
  if (!open) return null
  return (
    <Modal open onClose={onClose}>
      <ModalHeader title="Open a release" onClose={onClose} />
      <div className="modal-body">
        <div className="field">
          <label>Release label</label>
          <input className="mono" value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>What changes (optional)</label>
          <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="vd: Thêm nhóm bệnh da liễu" />
        </div>
        {err && <div className="kb-error">{err}</div>}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!label.trim()} onClick={() => onCreate(label.trim(), desc.trim()).catch((e) => setErr(errorText(e)))}>
          Open release
        </button>
      </div>
    </Modal>
  )
}
