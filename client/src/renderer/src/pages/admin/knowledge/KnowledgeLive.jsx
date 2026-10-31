import { useState } from 'react'
import Icon from '../../../components/Icon'
import { LoadingBlock } from '../../../components/DataState'
import { translate } from '../../../i18n'
import { OPEN_STATUSES } from '../../../api/knowledgeApi'
import { useAuth } from '../../../context/AuthContext'
import ItemsTab from './ItemsTab'
import ReleaseTab, { ReviewPanel, ReleaseBadge } from './ReleaseTab'
import SourcesTab from './SourcesTab'
import AiLogsTab from './AiLogsTab'
import { useKnowledge, useNames, groupByKey, errorText } from './shared'

// Trang Cấu hình AI khi chạy với backend thật: tri thức OKF lưu ở server, duyệt theo bản phát hành (FR11, Architecture 5.1.10).
// Admin soạn nháp, mở / gửi bản phát hành, tắt khẩn cấp; Bác sĩ (reviewOnly) duyệt hoặc từ chối cả bản.
export default function KnowledgeLive({ reviewOnly = false }) {
  const { user } = useAuth()
  const { data, error, reload } = useKnowledge()
  const names = useNames(data?.items)
  const [tab, setTab] = useState(reviewOnly ? 'review' : 'items')
  const [askRelease, setAskRelease] = useState(0)
  const canEdit = !reviewOnly && user?.roleKey === 'admin'

  if (error)
    return (
      <div className="card">
        <div className="kb-error">{errorText(error)}</div>
        <button className="btn btn-ghost btn-sm" onClick={reload}>
          Try again
        </button>
      </div>
    )
  if (!data) return <LoadingBlock text="Loading the knowledge base..." />

  const active = data.releases.find((r) => r.status === 'Active')
  const open = data.releases.find((r) => OPEN_STATUSES.includes(r.status))
  const rules = groupByKey(data.items.rules).filter((g) => g.active)
  const count = (k) => groupByKey(data.items[k]).filter((g) => g.active).length
  const tabs = reviewOnly
    ? [
        { key: 'review', label: 'Review queue' },
        { key: 'items', label: 'Knowledge base' }
      ]
    : [
        { key: 'items', label: 'Knowledge base' },
        { key: 'release', label: 'Release' },
        { key: 'sources', label: 'Sources' },
        { key: 'ailogs', label: 'AI run log' }
      ]

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{reviewOnly ? 'Knowledge review' : 'AI knowledge base'}</h1>
          <p>
            {reviewOnly
              ? 'Approve or reject the release drafted by the administrator — you cannot approve a release you drafted'
              : 'Symptoms, conditions, their links, guideline excerpts and triage rules used by the AI — changes apply only after a doctor approves the release'}
          </p>
        </div>
        {active && (
          <span className="badge ok">
            <span>In use:</span> <span className="mono">{active.label}</span>
          </span>
        )}
      </div>

      {!reviewOnly && (
        <div className="ai-box ai-disclaimer">
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="content">
            <b>AI suggestions are for reference only and must be confirmed by a doctor.</b>{' '}
            <span>Red-flag and priority-floor rules are decided by these rules alone, never by the AI model.</span>
          </div>
        </div>
      )}

      <div className="ai-summary">
        <div className="stat-card">
          <div className="dot red" />
          <div>
            <div className="val">{rules.filter((g) => g.active.values.rule_type === 'RED_FLAG').length}</div>
            <div className="lbl">Red-flag rules in use</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="dot amber" />
          <div>
            <div className="val">{rules.filter((g) => g.active.values.rule_type === 'PRIORITY_FLOOR').length}</div>
            <div className="lbl">Priority-floor rules in use</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="dot" />
          <div>
            <div className="val">{count('conditions')}</div>
            <div className="lbl">Conditions</div>
            <div className="ai-small ai-soft">
              <span className="mono">{count('symptoms')}</span> <span>symptoms</span> · <span className="mono">{count('relations')}</span> <span>links</span>
            </div>
          </div>
        </div>
        <button className="stat-card ai-sum-card" onClick={() => setTab(reviewOnly ? 'review' : 'release')}>
          <div className={'dot ' + (open?.status === 'PendingApproval' ? 'red' : '')} />
          <div>
            <div className="lbl">Open release</div>
            {open ? (
              <div>
                <span className="mono">{open.label}</span> <ReleaseBadge status={open.status} />
              </div>
            ) : (
              <div className="ai-soft">—</div>
            )}
          </div>
        </button>
      </div>

      <div className="card">
        <div className="itabs ai-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={'itab' + (tab === t.key ? ' active' : '')}
              onClick={() => {
                setTab(t.key)
                setAskRelease(0)
              }}
            >
              <span>{t.label}</span>
              {t.key === 'review' && open?.status === 'PendingApproval' && <span className="ai-count alert">1</span>}
            </button>
          ))}
        </div>
        {tab === 'items' && (
          <ItemsTab
            data={data}
            names={names}
            canEdit={canEdit}
            openRelease={open}
            onChanged={reload}
            onOpenRelease={() => {
              setTab('release')
              setAskRelease((n) => n + 1)
            }}
          />
        )}
        {tab === 'release' && <ReleaseTab data={data} names={names} onChanged={reload} autoCreate={askRelease} />}
        {tab === 'sources' && <SourcesTab data={data} canEdit={canEdit} onChanged={reload} />}
        {tab === 'review' && <ReviewPanel data={data} names={names} onChanged={reload} />}
        {tab === 'ailogs' && <AiLogsTab />}
      </div>
      <p className="ai-foot-note">
        <Icon name="alert" /> <span>{translate('Knowledge is authored in Obsidian (OKF) and imported with import_okf, or edited here. Every change is versioned and written to the activity log.')}</span>
      </p>
    </div>
  )
}
