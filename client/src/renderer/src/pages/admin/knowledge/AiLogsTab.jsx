import { useEffect, useState } from 'react'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { AI_MODES, AI_RUN_TYPES, AI_STATUSES, listAiLogs } from '../../../api/reportsApi'
import { fmtDate } from './shared'

// Nhật ký AI cho Admin (FR09, NFR09): mỗi lượt chạy AI kèm phiên bản tri thức / model / prompt, độ trễ và quyết định
// của bác sĩ — truy vết được mà không lộ bệnh nhân (server không trả họ tên, triệu chứng hay đầu ra thô của LLM).
const PAGE = 50
const EMPTY = { from: '', to: '', run_type: '', status: '', mode: '' }

const RUN_LABEL = { Assessment: 'Assessment', Extraction: 'Symptom extraction' }
const STATUS_META = {
  Queued: { label: 'Queued', tone: '' },
  Running: { label: 'Running', tone: 'info' },
  Completed: { label: 'Completed', tone: 'ok' },
  Degraded: { label: 'Rule-only', tone: 'warn' },
  Failed: { label: 'Failed', tone: 'low' },
  Skipped: { label: 'Skipped (red flag)', tone: 'muted' }
}
const MODE_LABEL = { Full: 'Rules + model', RuleOnly: 'Rules only' }
const DECISION_LABEL = { AcceptedTop: 'Accepted top suggestion', ChoseOther: 'Chose another diagnosis', NoSuggestion: 'No suggestion shown' }
const sec = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + ' s')

export default function AiLogsTab() {
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    setErr('')
    listAiLogs(filters, PAGE, page * PAGE).then(setData, (e) => setErr(e.message))
  }, [filters, page])

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1
  const select = (key, values, labels) => (
    <select value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}>
      <option value="">All</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {translate(labels[v]?.label ?? labels[v] ?? v)}
        </option>
      ))}
    </select>
  )

  return (
    <div>
      <p className="ai-soft ai-small" style={{ marginTop: 0 }}>
        Every AI run with the knowledge release, model and prompt versions, timing and the doctor’s decision. No patient data is shown.
      </p>
      <div className="form-grid cols-4">
        <div className="field">
          <label>From</label>
          <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </div>
        <div className="field">
          <label>Run type</label>
          {select('run_type', AI_RUN_TYPES, RUN_LABEL)}
        </div>
        <div className="field">
          <label>Status</label>
          {select('status', AI_STATUSES, STATUS_META)}
        </div>
        <div className="field">
          <label>Mode</label>
          {select('mode', AI_MODES, MODE_LABEL)}
        </div>
      </div>
      <div className="ai-toolbar" style={{ marginTop: 12 }}>
        <span className="ai-soft ai-small">
          {data ? (
            <>
              <b className="mono">{data.total.toLocaleString('vi-VN')}</b> <span>runs</span>
            </>
          ) : (
            '…'
          )}
        </span>
        <div className="ai-toolbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => (setDraft(EMPTY), setPage(0), setFilters(EMPTY))}>
            Clear filters
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => (setPage(0), setFilters(draft))}>
            <Icon name="search" /> Filter
          </button>
        </div>
      </div>

      {err && <div className="kb-error">{err}</div>}
      {!data && !err && <p className="ai-soft">Loading…</p>}
      {data && (
        <div className="ai-table-wrap" style={{ marginTop: 10 }}>
          <table className="dt">
            <thead>
              <tr>
                <th>Queued</th>
                <th>Run</th>
                <th>Status</th>
                <th>Priority (rule → final)</th>
                <th>Suggested codes</th>
                <th className="num">Time</th>
                <th>Doctor’s decision</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((x) => {
                const st = STATUS_META[x.status] ?? { label: x.status, tone: '' }
                return (
                  <tr key={x.assessment_id + x.run_type} onClick={() => setOpen(open === x.assessment_id ? null : x.assessment_id)} style={{ cursor: 'pointer' }}>
                    <td className="mono ai-small">{fmtDate(x.queued_at)}</td>
                    <td className="ai-small">
                      {translate(RUN_LABEL[x.run_type] ?? x.run_type)}
                      {x.mode && <div className="ai-soft">{translate(MODE_LABEL[x.mode] ?? x.mode)}</div>}
                    </td>
                    <td>
                      <span className={'badge ' + st.tone}>{translate(st.label)}</span>
                      {x.attempt_count > 1 && (
                        <div className="ai-soft ai-small">
                          {x.attempt_count} {translate('attempts')}
                        </div>
                      )}
                    </td>
                    <td className="mono ai-small">{x.priority_rule || x.priority_final ? `${x.priority_rule ?? '—'} → ${x.priority_final ?? '—'}` : '—'}</td>
                    <td className="mono ai-small">{x.suggested_codes.length ? x.suggested_codes.join(', ') : '—'}</td>
                    <td className="num mono ai-small">{sec(x.latency_total_ms)}</td>
                    <td className="ai-small">{x.physician_decision ? translate(DECISION_LABEL[x.physician_decision] ?? x.physician_decision) : <span className="ai-soft">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {open && (() => {
            const x = data.items.find((i) => i.assessment_id === open)
            if (!x) return null
            return (
              <div className="pl-detail" style={{ marginTop: 10 }}>
                <div className="pref-row inline">
                  <span>Knowledge release</span>
                  <b className="mono">{x.knowledge_release_label ?? '—'}</b>
                </div>
                <div className="pref-row inline">
                  <span>Model / prompt</span>
                  <b className="mono">
                    {x.model_name ?? '—'} · {x.prompt_version ?? '—'}
                  </b>
                </div>
                <div className="pref-row inline">
                  <span>Time: rules / model / total</span>
                  <b className="mono">
                    {sec(x.latency_phase1_ms)} · {sec(x.latency_llm_ms)} · {sec(x.latency_total_ms)}
                  </b>
                </div>
                <div className="pref-row inline">
                  <span>Started → finished</span>
                  <b className="mono">
                    {fmtDate(x.started_at)} → {fmtDate(x.completed_at)}
                  </b>
                </div>
                {x.error_detail && <div className="kb-error">{x.error_detail}</div>}
              </div>
            )
          })()}
          {!data.items.length && <p className="ai-soft">No runs match.</p>}
        </div>
      )}
      <div className="ai-toolbar" style={{ marginTop: 10 }}>
        <span className="ai-small ai-soft">
          <span>Page</span> <span className="mono">{page + 1}</span> / <span className="mono">{pages}</span>
        </span>
        <div className="ai-toolbar-right">
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <button className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
