import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { getRelease, createRelease, submitRelease, approveRelease, rejectRelease, dropDraft, OPEN_STATUSES } from '../../../api/knowledgeApi'
import { Empty } from '../ui'
import { KIND_META, LogicView, Summary, errorText, fmtDate } from './shared'

export const RELEASE_STATUS = { Draft: 'Being drafted', PendingApproval: 'Awaiting approval', Active: 'Approved', Retired: 'Superseded' }
const RELEASE_TONE = { Draft: '', PendingApproval: 'info', Active: 'ok', Retired: 'muted' }
export const ReleaseBadge = ({ status }) => <span className={'badge ' + (RELEASE_TONE[status] ?? '')}>{RELEASE_STATUS[status] ?? status}</span>

function nextLabel(releases) {
  const y = new Date().getFullYear()
  const n = releases
    .map((r) => r.label.match(new RegExp(`^KB-${y}\\.(\\d+)$`))?.[1])
    .filter(Boolean)
    .map(Number)
  return `KB-${y}.${String((n.length ? Math.max(...n) : 0) + 1).padStart(2, '0')}`
}

const FIELD_LABEL = {
  symptom_name: 'Symptom name',
  category: 'Group',
  name_vi: 'Condition name',
  icd10_code: 'ICD-10 code',
  disease_group: 'Disease group',
  description: 'Description',
  polarity: 'Direction',
  weight: 'Weight',
  is_key: 'Key symptom',
  source_id: 'Source',
  title: 'Title',
  content: 'Content',
  source_locator: 'Location in the source',
  condition_code: 'Condition',
  rule_name: 'Rule name',
  rule_type: 'Rule type',
  resulting_priority: 'Resulting priority',
  reason_text: 'Reason shown to doctors',
  condition_logic: 'Condition'
}
// Cột khoá của từng loại — không so sánh vì khoá không đổi giữa các phiên bản.
const KEY_COLS = {
  symptoms: ['symptom_code'],
  conditions: ['condition_code'],
  relations: ['condition_code', 'symptom_code'],
  excerpts: ['excerpt_key'],
  rules: ['rule_key']
}

function show(field, v, ctx) {
  if (v === null || v === undefined || v === '') return <span className="ai-soft">—</span>
  if (field === 'condition_logic') return <LogicView node={v} names={ctx.names} />
  if (field === 'source_id') return <span>{ctx.sources[v] ?? v}</span>
  if (field === 'condition_code') return <span>{ctx.names.condition[v] ?? v}</span>
  if (typeof v === 'boolean') return <span>{v ? 'Yes' : 'No'}</span>
  return <span>{String(v)}</span>
}

function Change({ c, ctx, onDrop }) {
  const changed = c.active_values
    ? Object.keys(c.values).filter((k) => !KEY_COLS[c.kind]?.includes(k) && JSON.stringify(c.values[k]) !== JSON.stringify(c.active_values[k]))
    : []
  return (
    <div className="kb-change">
      <div className="kb-change-head">
        <span className={'badge ' + (c.action === 'new' ? 'ok' : 'info')}>{c.action === 'new' ? 'New' : 'Changed'}</span>
        <span className="ai-soft">{KIND_META[c.kind]?.one}</span>
        <span className="mono ai-small">
          {c.key} · v{c.version}
        </span>
        {onDrop && (
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onDrop(c)}>
            Remove from release
          </button>
        )}
      </div>
      {!c.active_values ? (
        <Summary kind={c.kind} values={c.values} names={ctx.names} />
      ) : changed.length ? (
        <table className="kb-diff">
          <tbody>
            {changed.map((k) => (
              <tr key={k}>
                <th>{FIELD_LABEL[k] ?? k}</th>
                <td className="kb-old">{show(k, c.active_values[k], ctx)}</td>
                <td className="kb-arrow">→</td>
                <td className="kb-new">{show(k, c.values[k], ctx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <span className="ai-small ai-soft">No field differs from the version in use.</span>
      )}
    </div>
  )
}

function ChangeList({ detail, ctx, onDrop }) {
  if (!detail) return <p className="ai-soft">Loading…</p>
  if (!detail.changes.length) return <Empty icon="folder" title="No changes yet" text="Add or edit items in the Knowledge base tab — each saved draft appears here." />
  return (
    <div className="kb-changes">
      {detail.changes.map((c) => (
        <Change key={c.kind + c.key} c={c} ctx={ctx} onDrop={onDrop} />
      ))}
    </div>
  )
}

const ctxOf = (data, names) => ({ names, sources: Object.fromEntries(data.sources.map((s) => [s.source_id, `${s.organization} · ${s.title}`])) })

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

function ReleaseHistory({ releases, onView }) {
  if (!releases.length) return <p className="ai-soft">No release yet.</p>
  return (
    <table className="dt">
      <thead>
        <tr>
          <th>Release</th>
          <th>Status</th>
          <th>Created</th>
          <th>Submitted</th>
          <th>Approved</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {[...releases]
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .map((r) => (
            <tr key={r.release_id}>
              <td>
                <b className="mono">{r.label}</b>
                {r.description && <div className="ai-small ai-soft">{r.description}</div>}
                {r.review_note && (
                  <div className="ai-small sp-warn">
                    <span>Doctor's note:</span> {r.review_note}
                  </div>
                )}
              </td>
              <td>
                <ReleaseBadge status={r.status} />
              </td>
              <td className="ai-small">{fmtDate(r.created_at)}</td>
              <td className="ai-small">{fmtDate(r.submitted_at)}</td>
              <td className="ai-small">{fmtDate(r.approved_at)}</td>
              <td>
                <button className="btn btn-ghost btn-sm" onClick={() => onView(r)}>
                  View
                </button>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}

function ReleaseModal({ release, ctx, onClose }) {
  const [detail, setDetail] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!release) return
    setDetail(null)
    setErr('')
    getRelease(release.release_id).then(setDetail, (e) => setErr(errorText(e)))
  }, [release])
  if (!release) return null
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Release') + ' ' + release.label} onClose={onClose} />
      <div className="modal-body">
        {err && <div className="kb-error">{err}</div>}
        <ChangeList detail={detail} ctx={ctx} />
      </div>
    </Modal>
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
                <span>Submitted</span> {fmtDate(pending.submitted_at)}
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
