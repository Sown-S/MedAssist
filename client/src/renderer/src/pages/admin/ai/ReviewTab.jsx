import { useState } from 'react'
import Icon from '../../../components/Icon'
import Modal, { ModalHeader } from '../../../components/Modal'
import { translate } from '../../../i18n'
import { useToast } from '../../../context/ToastContext'
import { submitForReview, withdraw, discardDraft, approve, reject, pickRuleData } from '../../../api/aiConfigStore'
import { fmtTime, fmtWeight, icdLabel } from './catalog'
import { findIssues } from './ruleEngine'
import { TypeBadge, CondChips, IcdCell, KIND_LABEL, ConfirmDialog, Empty } from './ui'

const FIELDS = [
  { key: 'type', label: 'Type', render: (d) => <TypeBadge type={d.type} /> },
  { key: 'cond', label: 'Conditions', render: (d) => <CondChips cond={d.cond} /> },
  { key: 'icd', label: 'Result (ICD-10)', render: (d) => <IcdCell code={d.icd} /> },
  { key: 'weight', label: 'Weight', render: (d) => <span className="mono">{fmtWeight(d.weight)}</span> },
  { key: 'rationale', label: 'Rationale', render: (d) => <span>{d.rationale}</span> },
  { key: 'reference', label: 'Reference source', render: (d) => <span>{d.reference}</span> },
  { key: 'enabled', label: 'On/off', render: (d) => <span>{d.enabled ? 'On' : 'Off'}</span> },
  { key: 'retired', label: 'Retired', render: (d) => <span>{d.retired ? 'Yes' : 'No'}</span> }
]

// Lý do từ chối hay gặp — bấm để điền nhanh; người soạn thấy lý do này khi bản nháp quay về.
const REJECT_REASONS = [
  'Clinical content is not correct',
  'Threshold or condition needs adjusting',
  'Missing or weak reference source',
  'Conflicts with an existing rule',
  'Wording is unclear for staff'
]

const ISSUE_TEXT = { duplicate: 'Duplicate of', conflict: 'Contradicts', overlap: 'Always fires together with' }

export default function ReviewTab({ rules, audit, user }) {
  const { showToast } = useToast()
  const [review, setReview] = useState(null) // { rule, mode: 'approve' | 'reject' }
  const [discard, setDiscard] = useState(null)
  const pending = rules
    .filter((r) => r.pending && (user.roleKey !== 'doctor' || r.pending.stage === 'review'))
    .sort((a, b) => (a.pending.stage === b.pending.stage ? b.pending.at.localeCompare(a.pending.at) : a.pending.stage === 'review' ? -1 : 1))

  return (
    <>
      <div className="ai-flow">
        <div className="ai-flow-step">
          <b>1</b> <span>Admin drafts the change</span>
        </div>
        <Icon name="chevronRight" />
        <div className="ai-flow-step">
          <b>2</b> <span>Submit for review</span>
        </div>
        <Icon name="chevronRight" />
        <div className="ai-flow-step">
          <b>3</b> <span>A doctor approves in Knowledge review</span>
        </div>
        <Icon name="chevronRight" />
        <div className="ai-flow-step">
          <b>4</b> <span>Applied as a new version</span>
        </div>
      </div>
      <p className="ai-soft" style={{ fontSize: 12.5, margin: '-4px 0 12px' }}>
        {translate('Turning a rule off takes effect immediately (safety switch); turning it back on comes here for approval.')}
      </p>

      {pending.length === 0 ? (
        <Empty icon="check" title="Nothing to review" text="All rule changes have been processed." />
      ) : (
        pending.map((r) => {
          const p = r.pending
          const before = r.version > 0 ? pickRuleData(r) : null
          const changed = FIELDS.filter((f) => !before || JSON.stringify(before[f.key]) !== JSON.stringify(p.data[f.key]))
          const issues = findIssues(r, rules)
          return (
            <div className="ai-review card" key={r.id}>
              <div className="ai-review-head">
                <div>
                  <b className="mono">{r.id}</b> <span className="badge info">{KIND_LABEL[p.kind]}</span>{' '}
                  {p.stage === 'review' ? <span className="badge warn">Awaiting doctor</span> : <span className="badge">Draft</span>}
                </div>
                <div className="ai-soft">
                  <span>by</span> <b>{p.by}</b> · <span className="mono">{fmtTime(p.at)}</span>
                </div>
              </div>
              {p.note && (
                <div className="ai-review-note">
                  <span className="lbl">Reason</span> {p.note}
                </div>
              )}
              {p.rejected && (
                <div className="warn-banner show danger" style={{ marginTop: 8 }}>
                  <div className="icon">
                    <Icon name="x" />
                  </div>
                  <div className="txt">
                    <b>
                      <span>Rejected by</span> {p.rejected.by} · <span className="mono">{fmtTime(p.rejected.at)}</span>
                    </b>
                    {p.rejected.comment}
                  </div>
                </div>
              )}
              <table className="dt ai-diff">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Current (applied)</th>
                    <th>Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {changed.map((f) => (
                    <tr key={f.key}>
                      <td className="ai-soft">{f.label}</td>
                      <td className="old">{before ? f.render(before) : <span className="ai-soft">—</span>}</td>
                      <td className="new">{f.render(p.data)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {issues.length > 0 && (
                <div className={'rv-issues ' + (issues.some((i) => i.kind !== 'overlap') ? 'danger' : 'caution')}>
                  <div className="rv-issues-head">
                    <Icon name="alert" /> {translate('Check against existing rules before approving')}
                  </div>
                  {issues.map((i) => (
                    <div className="rv-issue" key={i.with.id}>
                      <span className={'rv-kind ' + i.kind}>{translate(ISSUE_TEXT[i.kind])}</span>
                      <b className="mono">{i.with.id}</b>
                      <span className="mono rv-icd">{i.with.icd}</span>
                      <span className="rv-name">{translate(icdLabel(i.with.icd))}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="ai-review-actions">
                {p.stage === 'draft' && user.roleKey === 'doctor' ? (
                  <span className="ai-soft" style={{ fontSize: 12.5 }}>
                    {translate('Draft — not yet submitted for review.')}
                  </span>
                ) : p.stage === 'draft' ? (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDiscard(r)}>
                      Discard draft
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        submitForReview(r.id, user)
                        showToast('Submitted for doctor review')
                      }}
                    >
                      Submit for review
                    </button>
                  </>
                ) : (
                  <>
                    {user.roleKey !== 'doctor' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          withdraw(r.id, user)
                          showToast('Withdrawn to draft')
                        }}
                      >
                        Withdraw
                      </button>
                    )}
                    {user.roleKey === 'doctor' ? (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => setReview({ rule: r, mode: 'reject' })}>
                          Reject
                        </button>
                        <button className="btn btn-success btn-sm" onClick={() => setReview({ rule: r, mode: 'approve' })}>
                          <Icon name="check" /> <span>Approve &amp; apply</span>
                        </button>
                      </>
                    ) : (
                      <span className="ai-soft" style={{ fontSize: 12.5 }}>
                        {translate('Waiting for a doctor — the doctor signs in with their own account to approve.')}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <Icon name="clock" /> <span>Change log</span>
          <span className="cnt">{audit.length}</span>
        </div>
        <div className="ai-table-wrap" style={{ maxHeight: 340 }}>
          <table className="dt">
            <thead>
              <tr>
                <th>Time</th>
                <th>By</th>
                <th>Item</th>
                <th>Action</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 100).map((a, i) => (
                <tr key={i}>
                  <td className="mono">{fmtTime(a.at)}</td>
                  <td>{a.by}</td>
                  <td className="mono">{a.target}</td>
                  <td>{a.action}</td>
                  <td className="ai-soft">{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ReviewerModal review={review} reviewer={user} onClose={() => setReview(null)} />
      <ConfirmDialog
        open={!!discard}
        title={translate('Discard draft') + ' · ' + (discard?.id ?? '')}
        message="The proposed change will be deleted. The applied version is not affected."
        confirmLabel="Discard draft"
        danger
        onConfirm={() => {
          discardDraft(discard.id, user)
          setDiscard(null)
          showToast('Draft discarded')
        }}
        onCancel={() => setDiscard(null)}
      />
    </>
  )
}

// Người duyệt là BÁC SĨ đang đăng nhập bằng tài khoản của mình (server ghi người duyệt theo phiên đăng nhập —
// Architecture 5.1.10: người duyệt là bác sĩ và khác người soạn). Admin không duyệt thay được.
// Backend thật: POST /api/v1/knowledge/releases/{id}/approve | reject.
function ReviewerModal({ review, reviewer, onClose }) {
  const { showToast } = useToast()
  const [comment, setComment] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!review) return null
  const approving = review.mode === 'approve'

  function close() {
    setComment('')
    setErr('')
    onClose()
  }
  async function submit() {
    setErr('')
    if (!approving && comment.trim().length < 5) return setErr('Write the reason for rejecting (at least 5 characters).')
    setBusy(true)
    const out = approving ? approve(review.rule.id, reviewer, comment.trim()) : reject(review.rule.id, reviewer, comment.trim())
    setBusy(false)
    if (!out.ok) return setErr(translate(out.error))
    showToast(approving ? 'Approved — the new version is now live' : 'Change rejected and returned to draft')
    close()
  }

  return (
    <Modal open onClose={close}>
      <ModalHeader title={translate(approving ? 'Doctor approval' : 'Doctor rejection') + ' · ' + review.rule.id} onClose={close} />
      <div className="modal-body">
        <p className="ai-confirm-msg">
          {translate(approving ? 'You are approving as' : 'You are rejecting as')} <b>{reviewer.name}</b>.{' '}
          {translate(approving ? 'The change goes live immediately after approval.' : 'The change returns to draft with your reason.')}
        </p>
        <div className="field" style={{ marginTop: 10 }}>
          <label>
            {approving ? 'Comment (optional)' : 'Reason for rejecting'} {!approving && <span className="ai-req">*</span>}
          </label>
          {!approving && (
            <div className="rv-reasons">
              {REJECT_REASONS.map((r) => (
                <button key={r} type="button" className={'chip-btn' + (comment.includes(translate(r)) ? ' accent' : '')} onClick={() => setComment((c) => (c.includes(translate(r)) ? c : (c.trim() ? c.trim() + '; ' : '') + translate(r)))}>
                  {translate(r)}
                </button>
              ))}
            </div>
          )}
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={translate(approving ? 'Optional note for the change log' : 'Pick a reason above or write what needs to change — the author sees this')} />
        </div>
        {err && <div className="field-error-msg show">{err}</div>}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={close}>
          Cancel
        </button>
        <button
          className={'btn ' + (approving ? 'btn-success' : 'btn-danger')}
          disabled={busy}
          onClick={submit}
        >
          {approving ? 'Approve & apply' : 'Reject'}
        </button>
      </div>
    </Modal>
  )
}
