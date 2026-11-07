import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import { translate } from '../../../i18n'
import { getRelease } from '../../../api/knowledgeApi'
import { Empty } from '../ui'
import { KIND_META, Summary, errorText, fmtDate } from './shared'
import { LogicView } from './logic'

// Phần dùng chung của màn soạn bản phát hành (admin) và màn duyệt (bác sĩ): trạng thái, danh sách thay đổi, lịch sử.
export const RELEASE_STATUS = { Draft: 'Being drafted', PendingApproval: 'Awaiting approval', Active: 'Approved', Retired: 'Superseded' }
const RELEASE_TONE = { Draft: '', PendingApproval: 'info', Active: 'ok', Retired: 'muted' }
export const ReleaseBadge = ({ status }) => <span className={'badge ' + (RELEASE_TONE[status] ?? '')}>{RELEASE_STATUS[status] ?? status}</span>

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
  condition_logic: 'Rule condition'
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

export function ChangeList({ detail, ctx, onDrop }) {
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

export const ctxOf = (data, names) => ({ names, sources: Object.fromEntries(data.sources.map((s) => [s.source_id, `${s.organization} · ${s.title}`])) })

export function ReleaseHistory({ releases, onView }) {
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

export function ReleaseModal({ release, ctx, onClose }) {
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
