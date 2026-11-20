import { useEffect, useState } from 'react'
import Modal, { ModalHeader, ModalCloseFooter } from '../../../components/Modal'
import { translate } from '../../../i18n'
import { getRelease } from '../../../api/knowledgeApi'
import { Empty } from '../ui'
import { KIND_META, Summary, errorText } from './shared'
import { LogicView } from './logic'
import { fmtDateTime } from '../../../utils/format'
import Skeleton from '../../../components/Skeleton'
import { ErrorNote } from '../../../components/DataState'
import Icon from '../../../components/Icon'

// Phần dùng chung của màn soạn bản phát hành (admin) và màn duyệt (bác sĩ): trạng thái, danh sách thay đổi, lịch sử.
const RELEASE_STATUS = { Draft: 'Being drafted', PendingApproval: 'Awaiting approval', Active: 'Approved', Retired: 'Superseded' }
const RELEASE_TONE = { Draft: '', PendingApproval: 'b-info', Active: 'b-success', Retired: 'b-neutral' }
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
  if (v === null || v === undefined || v === '') return <span className="muted">—</span>
  if (field === 'condition_logic') return <LogicView node={v} names={ctx.names} />
  if (field === 'source_id') return <span>{ctx.sources[v] ?? v}</span>
  if (field === 'condition_code') return <span>{ctx.names.condition[v] ?? v}</span>
  if (typeof v === 'boolean') return <span>{v ? 'Yes' : 'No'}</span>
  return <span>{String(v)}</span>
}

function Change({ c, ctx, onDrop }) {
  const [open, setOpen] = useState(false)
  const fields = Object.keys(c.values ?? {}).filter((k) => !KEY_COLS[c.kind]?.includes(k))
  const changed = c.active_values
    ? Object.keys(c.values).filter((k) => !KEY_COLS[c.kind]?.includes(k) && JSON.stringify(c.values[k]) !== JSON.stringify(c.active_values[k]))
    : []
  return (
    <div className="kb-change">
      <div className="kb-change-head">
        <span className={'badge ' + (c.action === 'new' ? 'b-success' : 'b-info')}>{c.action === 'new' ? 'New' : 'Changed'}</span>
        <span className="muted">{KIND_META[c.kind]?.one}</span>
        <span className="num small">
          {c.key} · v{c.version}
        </span>
        <span className="sp" />
        <button className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {translate(open ? 'Hide' : 'Details')}
        </button>
        {onDrop && (
          <button className="btn btn-ghost btn-sm" onClick={() => onDrop(c)}>
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
        <span className="small muted">No field differs from the version in use.</span>
      )}
      {open && (
        <table className="kb-full">
          <tbody>
            {fields.map((k) => (
              <tr key={k} className={changed.includes(k) ? 'chg' : ''}>
                <th>{translate(FIELD_LABEL[k] ?? k)}</th>
                <td>{show(k, c.values[k], ctx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Danh sách thay đổi của một bản phát hành: dòng tổng (mỗi loại có bao nhiêu mục mới / sửa — loại 0 mục vẫn hiện,
// để thấy ngay VD “Bệnh: 0”), lọc theo loại, tìm theo tên / mã, mỗi mục mở được toàn bộ trường.
const KINDS = ['conditions', 'symptoms', 'relations', 'excerpts', 'rules']
const textOf = (c, ctx) => {
  const v = c.values ?? {}
  return [c.key, v.symptom_name, v.name_vi, v.icd10_code, v.title, v.rule_name, ctx.names.condition[v.condition_code], ctx.names.symptom[v.symptom_code]].filter(Boolean).join(' ').toLowerCase()
}
const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')

export function ChangeList({ detail, ctx, onDrop }) {
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  if (!detail) return <Skeleton rows={4} />
  if (!detail.changes.length) return <Empty icon="folder" title="No changes yet" text="Add or edit items in the Knowledge base tab — each saved draft appears here." />
  const count = (k, a) => detail.changes.filter((c) => (k === 'all' || c.kind === k) && (!a || c.action === a)).length
  const term = fold(q.trim().toLowerCase())
  const list = detail.changes.filter((c) => (kind === 'all' || c.kind === kind) && (!term || fold(textOf(c, ctx)).includes(term)))
  return (
    <div className="kb-changes">
      <div className="kb-sum">
        {KINDS.map((k) => (
          <button key={k} type="button" className={'kb-sum-i' + (kind === k ? ' on' : '') + (count(k) ? '' : ' zero')} onClick={() => setKind(kind === k ? 'all' : k)}>
            <b className="num">{count(k)}</b>
            <span>{translate(KIND_META[k].label)}</span>
            <small>
              {count(k, 'new')} {translate('new')} · {count(k) - count(k, 'new')} {translate('changed')}
            </small>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <div className="seg">
          <button className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>
            {translate('All')} <span className="num">{count('all')}</span>
          </button>
          {KINDS.filter((k) => count(k)).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {translate(KIND_META[k].label)} <span className="num">{count(k)}</span>
            </button>
          ))}
        </div>
        <span className="sp" />
        <div className="search">
          <Icon name="search" />
          <input className="input" type="search" placeholder={translate('Find by name or code…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {list.length ? (
        list.map((c) => <Change key={c.kind + c.key} c={c} ctx={ctx} onDrop={onDrop} />)
      ) : (
        <p className="muted small" style={{ padding: '8px 2px' }}>
          {translate(kind !== 'all' && !count(kind) ? 'This release has no change of this type.' : 'No change matches the search.')}
        </p>
      )}
    </div>
  )
}

export const ctxOf = (data, names) => ({ names, sources: Object.fromEntries(data.sources.map((s) => [s.source_id, `${s.organization} · ${s.title}`])) })

export function ReleaseHistory({ releases, onView }) {
  if (!releases.length) return <p className="muted">No release yet.</p>
  return (
    <div className="tbl-wrap">
      <table>
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
                  <b className="num">{r.label}</b>
                  {r.description && <div className="small muted">{r.description}</div>}
                  {r.review_note && (
                    <div className="small sp-warn">
                      <span>Doctor's note:</span> {r.review_note}
                    </div>
                  )}
                </td>
                <td>
                  <ReleaseBadge status={r.status} />
                </td>
                <td className="small">{fmtDateTime(r.created_at)}</td>
                <td className="small">{fmtDateTime(r.submitted_at)}</td>
                <td className="small">{fmtDateTime(r.approved_at)}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => onView(r)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
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
      <div className="modal-b">
        <ErrorNote>{err}</ErrorNote>
        <div className="kb-rel-h">
          <ReleaseBadge status={release.status} />
          {release.description && <span className="kb-rel-desc">{release.description}</span>}
          <span className="kb-rel-dates small muted">
            {translate('Created')} {fmtDateTime(release.created_at) || '—'} · {translate('Submitted')} {fmtDateTime(release.submitted_at) || '—'} · {translate('Approved')}{' '}
            {fmtDateTime(release.approved_at) || '—'}
          </span>
          {release.review_note && (
            <div className="banner w">
              <Icon name="message-square" />
              <div className="txt">
                <b>{translate("Doctor's note:")}</b> {release.review_note}
              </div>
            </div>
          )}
        </div>
        <ChangeList detail={detail} ctx={ctx} />
      </div>
      <ModalCloseFooter onClose={onClose} />
    </Modal>
  )
}
