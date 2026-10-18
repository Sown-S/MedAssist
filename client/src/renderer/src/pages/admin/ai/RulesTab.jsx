import { useMemo, useState } from 'react'
import Icon from '../../../components/Icon'
import Modal, { ModalHeader } from '../../../components/Modal'
import { translate } from '../../../i18n'
import { useToast } from '../../../context/ToastContext'
import { saveDraft, disableNow } from '../../../api/aiConfigStore'
import { RULE_TYPES, symptomLabel, icdLabel, fmtTime } from './catalog'
import { allIssues } from './ruleEngine'
import RuleFormModal from './RuleFormModal'
import { Switch, TypeBadge, CondChips, IcdCell, WeightCell, RuleStatus, ConfirmDialog, Empty, KIND_LABEL } from './ui'

const STATUS_FILTERS = [
  { key: 'all', label: 'All except retired' },
  { key: 'live', label: 'Live' },
  { key: 'disabled', label: 'Turned off' },
  { key: 'retired', label: 'Retired' },
  { key: 'pending', label: 'Has a pending change' }
]

function statusMatch(r, s) {
  if (s === 'all') return !r.retired || r.pending
  if (s === 'live') return r.version > 0 && r.enabled && !r.retired
  if (s === 'disabled') return r.version > 0 && !r.enabled && !r.retired
  if (s === 'retired') return r.retired
  return !!r.pending
}

function haystack(r) {
  const parts = [
    r.id,
    r.icd,
    icdLabel(r.icd),
    r.rationale,
    r.reference,
    ...r.cond.symptoms.map(symptomLabel),
    ...(r.cond.absent ?? []).map(symptomLabel)
  ]
  // Tìm được bằng cả tiếng Anh lẫn tiếng Việt.
  return parts
    .flatMap((p) => [p, translate(p ?? '')])
    .join(' ')
    .toLowerCase()
}

const ISSUE_TEXT = { duplicate: 'Duplicate', conflict: 'Contradiction', overlap: 'Always fire together' }

export default function RulesTab({ rules, audit, user, onOpenReview }) {
  const { showToast } = useToast()
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null) // { rule } | null
  const [historyOf, setHistoryOf] = useState(null)
  const [action, setAction] = useState(null) // { rule, kind, patch }
  const [expanded, setExpanded] = useState(null)

  const issues = useMemo(() => allIssues(rules), [rules])
  const counts = useMemo(() => {
    const c = { all: 0 }
    for (const r of rules.filter((x) => statusMatch(x, status))) {
      c.all++
      c[r.type] = (c[r.type] ?? 0) + 1
    }
    return c
  }, [rules, status])

  const list = rules.filter(
    (r) => (type === 'all' || r.type === type) && statusMatch(r, status) && (!q.trim() || haystack(r).includes(q.trim().toLowerCase()))
  )

  function ask(rule, kind, patch) {
    setAction({ rule, kind, patch })
  }
  function confirmAction(note) {
    const { rule, kind, patch } = action
    // Tắt: có hiệu lực ngay (công tắc an toàn). Bật lại / ngừng hẳn: gửi bác sĩ duyệt.
    if (kind === 'disable') {
      const r = disableNow(rule.id, note, user)
      setAction(null)
      return showToast(r.ok ? 'Rule turned off immediately — turning it back on needs doctor approval' : translate(r.error))
    }
    saveDraft(rule.id, patch, note, user, { submit: true, kind })
    setAction(null)
    showToast('Submitted for doctor review')
  }

  const locked = (r) => r.pending?.stage === 'review'

  return (
    <>
      {issues.length > 0 && (
        <div className={'warn-banner show ' + (issues.some((i) => i.kind !== 'overlap') ? 'danger' : 'caution')} style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="txt">
            <b>Duplicate or contradicting rules detected</b>
            {issues.map((i) => (
              <div key={i.rule.id + i.with.id}>
                <span className="mono">{i.rule.id}</span> ↔ <span className="mono">{i.with.id}</span> — <span>{ISSUE_TEXT[i.kind]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ai-toolbar">
        <div className="ai-seg">
          <button className={type === 'all' ? 'active' : ''} onClick={() => setType('all')}>
            <span>All</span> <span className="ai-count">{counts.all}</span>
          </button>
          {RULE_TYPES.map((t) => (
            <button key={t.key} className={type === t.key ? 'active' : ''} onClick={() => setType(t.key)}>
              <span>{t.label}</span> <span className="ai-count">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="ai-toolbar-right">
          <div className="ai-search">
            <Icon name="search" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by ID, symptom, ICD-10 code, rationale…" />
          </div>
          <select className="ai-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => setForm({ rule: null })}>
            + Add rule
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty title="No rules match" text="Try another type, status or search keyword." />
      ) : (
        <div className="ai-table-wrap">
          <table className="dt ai-rules">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Condition (If)</th>
                <th>Result (Then)</th>
                <th>Weight</th>
                <th>Status</th>
                <th>On</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <FragmentRow
                  key={r.id}
                  r={r}
                  open={expanded === r.id}
                  onToggleOpen={() => setExpanded(expanded === r.id ? null : r.id)}
                  locked={locked(r)}
                  onEdit={() => setForm({ rule: r })}
                  onHistory={() => setHistoryOf(r)}
                  onToggle={(on) => ask(r, on ? 'enable' : 'disable', { enabled: on })}
                  onRetire={() => ask(r, r.retired ? 'restore' : 'retire', { retired: !r.retired })}
                  onOpenReview={onOpenReview}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="ai-foot-note">
        <Icon name="lock" /> <span>Every change (add, edit, on/off, retire) becomes a draft and only applies after a doctor approves it.</span>
      </p>

      <RuleFormModal
        open={!!form}
        rule={form?.rule}
        rules={rules}
        user={user}
        onClose={() => setForm(null)}
      />
      <HistoryModal rule={historyOf} audit={audit} user={user} onClose={() => setHistoryOf(null)} />
      <ConfirmDialog
        open={!!action}
        title={action ? translate(KIND_LABEL[action.kind]) + ' · ' + action.rule.id : ''}
        message={
          action?.kind === 'disable'
            ? (action.rule.type === 'redflag' ? translate('Warning: this is a red-flag rule. Turning it off means doctors will NOT be alerted for this emergency sign.') + ' ' : '') +
              translate('Takes effect immediately — no approval needed (safety switch). Turning it back on needs doctor approval.')
            : action?.kind === 'retire'
              ? action.rule.type === 'redflag'
                ? 'Warning: this is a red-flag rule. Turning it off means doctors will NOT be alerted for this emergency sign.'
                : 'Doctors will stop receiving this suggestion once the change is approved.'
              : 'The rule will be active again once the change is approved.'
        }
        confirmLabel={action?.kind === 'disable' ? 'Turn off now' : 'Submit for doctor review'}
        danger={action?.kind === 'disable' || action?.kind === 'retire'}
        requireNote
        onConfirm={confirmAction}
        onCancel={() => setAction(null)}
      />
    </>
  )
}

function FragmentRow({ r, open, onToggleOpen, locked, onEdit, onHistory, onToggle, onRetire, onOpenReview }) {
  const newRule = r.version === 0
  return (
    <>
      <tr className={'ai-row' + (r.retired ? ' retired' : '') + (open ? ' open' : '')}>
        <td className="mono">
          <button className="ai-expand" onClick={onToggleOpen} title="Show rationale">
            <Icon name={open ? 'chevronDown' : 'chevronRight'} />
          </button>
          {r.id}
        </td>
        <td>
          <TypeBadge type={r.type} />
        </td>
        <td>
          <CondChips cond={r.cond} />
        </td>
        <td>
          <IcdCell code={r.icd} />
          <div className="ai-rationale">{r.rationale}</div>
        </td>
        <td>
          <WeightCell w={r.weight} />
        </td>
        <td>
          <RuleStatus rule={r} />
        </td>
        <td>
          <Switch
            checked={r.enabled && !r.retired}
            disabled={newRule || r.retired || (locked && !r.enabled)}
            onChange={onToggle}
            title={r.enabled ? 'Turn off immediately (safety switch)' : locked ? 'A change is awaiting review' : 'Turn back on (requires doctor approval)'}
          />
        </td>
        <td className="ai-actions">
          {locked ? (
            <button className="btn btn-ghost btn-sm" onClick={onOpenReview}>
              View review
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" title="Edit" onClick={onEdit}>
              <Icon name="pencil" />
            </button>
          )}
          <button className="btn btn-ghost btn-sm" title="Version history" onClick={onHistory}>
            <Icon name="clock" />
          </button>
          {!newRule && !locked && (
            <button className="btn btn-ghost btn-sm" title={r.retired ? 'Restore' : 'Retire'} onClick={onRetire}>
              <Icon name={r.retired ? 'repeat' : 'ban'} />
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="ai-detail">
          <td />
          <td colSpan={7}>
            <div className="ai-detail-grid">
              <div>
                <div className="lbl">Rationale</div>
                <div>{r.rationale}</div>
              </div>
              <div>
                <div className="lbl">Reference source</div>
                <div>{r.reference}</div>
              </div>
              <div>
                <div className="lbl">Version</div>
                <div>
                  <span className="mono">v{r.version}</span> · <span>{fmtTime(r.updatedAt)}</span>
                </div>
              </div>
              <div>
                <div className="lbl">Approved by</div>
                <div>{r.approvedBy ?? '—'}</div>
              </div>
            </div>
            {r.pending && (
              <div className="ai-pending-note">
                <span className="badge info">{KIND_LABEL[r.pending.kind]}</span> <span>by</span> <b>{r.pending.by}</b> ·{' '}
                <span className="mono">{fmtTime(r.pending.at)}</span> — <i>{r.pending.note}</i>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function HistoryModal({ rule, audit, user, onClose }) {
  const { showToast } = useToast()
  const [restore, setRestore] = useState(null)
  if (!rule) return null
  const log = audit.filter((a) => a.target === rule.id)
  return (
    <>
      <Modal open onClose={onClose} wide>
        <ModalHeader title={translate('Version history') + ' · ' + rule.id} onClose={onClose} />
        <div className="modal-body">
          <div className="timeline">
            <div className="tl-item tl-latest">
              <div className="tl-head">
                <b>
                  <span className="mono">v{rule.version}</span> · <span>Current</span>
                </b>
                <span className="dt">{fmtTime(rule.updatedAt)}</span>
              </div>
              <div className="tl-body">
                <CondChips cond={rule.cond} />
                <div style={{ marginTop: 6 }}>
                  <TypeBadge type={rule.type} /> <IcdCell code={rule.icd} /> <WeightCell w={rule.weight} />
                </div>
                <span className="lbl">Author · Approved by</span>
                <span>{rule.updatedBy ?? '—'}</span> · <span>{rule.approvedBy ?? '—'}</span>
              </div>
            </div>
            {rule.history.map((h) => (
              <div className="tl-item" key={h.version}>
                <div className="tl-head">
                  <b className="mono">v{h.version}</b>
                  <span className="dt">{fmtTime(h.at)}</span>
                </div>
                <div className="tl-body">
                  {h.snap ? (
                    <>
                      <CondChips cond={h.snap.cond} />
                      <div style={{ marginTop: 6 }}>
                        <TypeBadge type={h.snap.type} /> <IcdCell code={h.snap.icd} /> <WeightCell w={h.snap.weight} />
                      </div>
                    </>
                  ) : (
                    <span className="ai-soft">Content not archived (created before versioning).</span>
                  )}
                  <span className="lbl">Author · Approved by</span>
                  <span>{h.by ?? '—'}</span> · <span>{h.approvedBy ?? '—'}</span>
                  {h.note && <div className="ai-soft">{h.note}</div>}
                  {h.snap && !rule.pending && (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setRestore(h)}>
                      <Icon name="repeat" /> <span>Restore this version</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="section-label">Change log</div>
          {log.length === 0 ? (
            <p className="ai-soft">No entries.</p>
          ) : (
            <table className="dt">
              <tbody>
                {log.map((a, i) => (
                  <tr key={i}>
                    <td className="mono">{fmtTime(a.at)}</td>
                    <td>{a.by}</td>
                    <td>{a.action}</td>
                    <td className="ai-soft">{a.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!restore}
        title={translate('Roll back') + ' · ' + rule.id + ' → v' + (restore?.version ?? '')}
        message="A draft with the old content will be created. It only applies after a doctor approves it."
        confirmLabel="Submit for doctor review"
        requireNote
        onConfirm={(note) => {
          saveDraft(rule.id, restore.snap, note, user, { submit: true, kind: 'rollback' })
          setRestore(null)
          onClose()
          showToast('Submitted for doctor review')
        }}
        onCancel={() => setRestore(null)}
      />
    </>
  )
}
