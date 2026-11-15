import { useEffect, useMemo, useState } from 'react'
import Modal, { ModalHeader, ModalCloseFooter } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { KINDS, itemVersions, previewDeactivate, deactivate } from '../../../api/knowledgeApi'
import { Empty } from '../ui'
import ItemFormModal from './ItemFormModal'
import { KIND_META, StatusBadge, Summary, groupByKey, errorText } from './shared'
import { shortDateTime } from '../../../utils/format'
import Skeleton from '../../../components/Skeleton'
import { ErrorNote } from '../../../components/DataState'

const FILTERS = [
  { key: 'current', label: 'In use + drafts' },
  { key: 'Active', label: 'In use' },
  { key: 'open', label: 'Drafts / awaiting approval' },
  { key: 'Retired', label: 'Retired only' },
  { key: 'all', label: 'All' }
]

function haystack(g, names) {
  const v = (g.open ?? g.active ?? g.latest).values
  const extra = [names.condition[v.condition_code], names.symptom[v.symptom_code]]
  return [g.key, ...Object.values(v).filter((x) => typeof x === 'string'), ...extra].join(' ').toLowerCase()
}

export default function ItemsTab({ data, names, canEdit, openRelease, onChanged, onOpenRelease }) {
  const { showToast } = useToast()
  const [kind, setKind] = useState('rules')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('current')
  const [form, setForm] = useState(null)
  const [historyOf, setHistoryOf] = useState(null)
  const [off, setOff] = useState(null)
  const editable = canEdit && openRelease?.status === 'Draft'

  const groups = useMemo(() => groupByKey(data.items[kind]), [data, kind])
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, groupByKey(data.items[k]).filter((g) => g.active).length])), [data])
  const list = groups.filter((g) => {
    if (filter === 'current' && !(g.active || g.open)) return false
    if (filter === 'Active' && !g.active) return false
    if (filter === 'open' && !g.open) return false
    if (filter === 'Retired' && (g.active || g.open)) return false
    return !q.trim() || haystack(g, names).includes(q.trim().toLowerCase())
  })

  return (
    <>
      {canEdit && !editable && (
        <div className="banner i" style={{ marginBottom: 14 }}>
          <Icon name="lock" />
          <div className="txt">
            {openRelease?.status === 'PendingApproval'
              ? translate('The open release is waiting for a doctor — changes are locked until it is approved or rejected.')
              : translate('To change the knowledge base, open a release first.')}
          </div>
          {!openRelease && (
            <button className="btn btn-primary btn-sm" onClick={onOpenRelease}>
              Open a release
            </button>
          )}
        </div>
      )}

      <div className="toolbar">
        <div className="seg">
          {KINDS.map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              <span>{KIND_META[k].label}</span> <span className="badge b-neutral">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-r">
          <div className="search">
            <Icon name="search" />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code or name…" />
          </div>
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          {editable && (
            <button className="btn btn-primary btn-sm" onClick={() => setForm({ group: null })}>
              + New
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <Empty title="Nothing matches" text="Try another type, filter or search keyword." />
      ) : (
        <div className="tbl-wrap">
          <table className="kb-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Content</th>
                <th>Version</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((g) => {
                const row = g.open ?? g.active ?? g.latest
                return (
                  <tr key={g.key}>
                    <td className="num small">{g.key}</td>
                    <td>
                      <Summary kind={kind} values={row.values} names={names} />
                    </td>
                    <td className="num">
                      v{row.version}
                      <div className="small muted">{row.release_label}</div>
                    </td>
                    <td>
                      <div className="ai-status">
                        {g.active ? <StatusBadge status="Active" /> : <StatusBadge status={g.latest.status} />}
                        {g.open && <StatusBadge status={g.open.status} />}
                      </div>
                    </td>
                    <td className="kb-actions">
                      {editable && (g.active || g.open) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setForm({ group: g })}>
                          Edit
                        </button>
                      )}
                      {canEdit && g.active && (
                        <button className="btn btn-ghost btn-sm kb-danger" onClick={() => setOff(g)}>
                          Turn off now
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setHistoryOf(g)}>
                        History
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small foot-note">
        <Icon name="lock" />{' '}
        <span>Every change becomes a draft in the open release and only applies after a doctor approves the release. “Turn off now” is the safety switch: it applies immediately.</span>
      </p>

      <ItemFormModal
        open={!!form}
        kind={kind}
        group={form?.group ?? null}
        data={data}
        names={names}
        onClose={() => setForm(null)}
        onSaved={() => {
          setForm(null)
          showToast(translate('Draft saved'))
          onChanged()
        }}
      />
      <HistoryModal kind={kind} group={historyOf} names={names} onClose={() => setHistoryOf(null)} />
      <DeactivateModal
        kind={kind}
        group={off}
        names={names}
        onClose={() => setOff(null)}
        onDone={(n) => {
          setOff(null)
          showToast(translate('Turned off') + (n ? ` (+${n})` : ''))
          onChanged()
        }}
      />
    </>
  )
}

function HistoryModal({ kind, group, names, onClose }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!group) return
    setRows(null)
    setErr('')
    itemVersions(kind, group.key).then(setRows, (e) => setErr(errorText(e)))
  }, [kind, group])
  if (!group) return null
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Version history') + ' · ' + group.key} onClose={onClose} />
      <div className="modal-b">
        <ErrorNote>{err}</ErrorNote>
        {!rows && !err && <Skeleton rows={6} cols={4} />}
        {rows && (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Release</th>
                  <th>Status</th>
                  <th>Content</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.version}>
                    <td className="num">v{r.version}</td>
                    <td className="num small">{r.release_label}</td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.retired_reason && <div className="small muted">{r.retired_reason}</div>}
                    </td>
                    <td>
                      <Summary kind={kind} values={r.values} names={names} />
                    </td>
                    <td className="small">{shortDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ModalCloseFooter onClose={onClose} />
    </Modal>
  )
}

// Xem trước các mục phụ thuộc sẽ bị tắt theo (VD tắt triệu chứng → tắt luật dùng nó); bắt buộc lý do.
function DeactivateModal({ kind, group, names, onClose, onDone }) {
  const [deps, setDeps] = useState(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!group) return
    setDeps(null)
    setReason('')
    setErr('')
    previewDeactivate(kind, group.key).then(
      (p) => setDeps(p.dependents),
      (e) => setErr(errorText(e))
    )
  }, [kind, group])
  if (!group) return null
  const isRedFlag = kind === 'rules' && group.active?.values?.rule_type === 'RED_FLAG'

  async function confirm() {
    setBusy(true)
    setErr('')
    try {
      const off = await deactivate(kind, group.key, reason.trim(), deps)
      onDone(off.length)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose}>
      <ModalHeader title={translate('Turn off now') + ' · ' + group.key} onClose={onClose} />
      <div className="modal-b">
        <div className="confirm">
          <div className="ico d">
            <Icon name="power" />
          </div>
          <p>
            <Summary kind={kind} values={group.active?.values} names={names} />
            <br />
            <span className="muted small">{translate('Takes effect immediately — no approval needed (safety switch). Turning it back on needs a new version in an approved release.')}</span>
          </p>
        </div>
        {isRedFlag && (
          <div className="banner d" style={{ marginTop: 14 }}>
            <Icon name="siren" />
            <div className="txt">{translate('Warning: this is a red-flag rule. Turning it off means doctors will NOT be alerted for this emergency sign.')}</div>
          </div>
        )}
        {!deps && !err && <Skeleton rows={2} cols={2} compact />}
        {deps && deps.length > 0 && (
          <div className="banner w" style={{ marginTop: 14 }}>
            <Icon name="triangle-alert" />
            <div className="txt">
              <b>These items will be turned off too:</b>
              <ul className="kb-dep-list">
                {deps.map((d) => (
                  <li key={d.kind + d.key}>
                    <span>{KIND_META[d.kind]?.one ?? d.kind}</span> · <span className="num">{d.key}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="field" style={{ marginTop: 12 }}>
          <label>
            Reason <span className="req">*</span>
          </label>
          <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the activity log (at least 3 characters)" />
        </div>
        <ErrorNote>{err}</ErrorNote>
      </div>
      <div className="modal-f">
        <button className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-danger" disabled={busy || !deps || reason.trim().length < 3} onClick={confirm}>
          Turn off now
        </button>
      </div>
    </Modal>
  )
}
