import { useState } from 'react'
import Icon from '../../../components/Icon'
import { LoadingBlock } from '../../../components/DataState'
import { translate } from '../../../i18n'
import { OPEN_STATUSES } from '../../../api/knowledgeApi'
import { useAuth } from '../../../context/AuthContext'
import ItemsTab from './ItemsTab'
import ReleaseTab from './ReleaseTab'
import { ReviewPanel } from './ReviewPanel'
import { ReleaseBadge } from './releaseParts'
import { MiniStat, MiniStats } from '../../../components/MiniStat'
import SourcesTab from './SourcesTab'
import AiLogsTab from './AiLogsTab'
import { useKnowledge, useNames, groupByKey, errorText } from './shared'

// Cấu hình AI: tri thức OKF trên server, duyệt theo bản phát hành (FR11).
// Admin soạn nháp, gửi duyệt, tắt khẩn cấp; bác sĩ (reviewOnly) duyệt hoặc từ chối cả bản.
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
    <div className="vflow">
      <div className="pg-h">
        <div>
          <h2>{reviewOnly ? 'Knowledge review' : 'AI knowledge base'}</h2>
          <p>
            {reviewOnly
              ? 'Approve or reject the release drafted by the administrator — you cannot approve a release you drafted'
              : 'Symptoms, conditions, their links, guideline excerpts and triage rules used by the AI — changes apply only after a doctor approves the release'}
          </p>
        </div>
        {active && (
          <span className="badge b-success">
            <span>In use:</span> <span className="num">{active.label}</span>
          </span>
        )}
      </div>

      {!reviewOnly && (
        <div className="ctx-banner">
          <Icon name="alert" />
          <span className="txt">
            <b>AI suggestions are for reference only and must be confirmed by a doctor.</b>{' '}
            <span>Red-flag and priority-floor rules are decided by these rules alone, never by the AI model.</span>
          </span>
        </div>
      )}

      {!reviewOnly && (
        <div className="grid-2e">
          {[
            ['RED_FLAG', 'Red-flag rules in use', 'siren', 'd'],
            ['PRIORITY_FLOOR', 'Priority-floor rules in use', 'alert', 'w']
          ].map(([type, title, icon, tone]) => {
            const list = rules.filter((g) => g.active.values.rule_type === type)
            return (
              <div className="card rule-card" key={type}>
                <div className="card-title">
                  {translate(title)} <span className="cnt">{list.length}</span>
                </div>
                <div className="rule-list">
                  {list.map((g) => (
                    <div className="rule-li" key={g.key}>
                      <span className={'is-ico t-' + tone}>
                        <Icon name={icon} />
                      </span>
                      <span className="rl-t">
                        <b>{g.active.values.rule_name || g.key}</b>
                        <small>{g.active.values.reason_text}</small>
                      </span>
                    </div>
                  ))}
                  {!list.length && <p className="ai-soft">—</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {reviewOnly ? (
        <ReviewPanel data={data} names={names} onChanged={reload} />
      ) : (
        <>
      <MiniStats>
        <MiniStat icon="fileText" value={count('conditions')} label="Conditions">
          <span className="is-sub">
            <span className="num">{count('symptoms')}</span> <span>symptoms</span> · <span className="num">{count('relations')}</span> <span>links</span>
          </span>
        </MiniStat>
        {reviewOnly && <MiniStat icon="siren" tone="d" value={rules.filter((g) => g.active.values.rule_type === 'RED_FLAG').length} label="Red-flag rules in use" />}
        {reviewOnly && <MiniStat icon="alert" tone="w" value={rules.filter((g) => g.active.values.rule_type === 'PRIORITY_FLOOR').length} label="Priority-floor rules in use" />}
        <MiniStat
          icon="history"
          tone={open?.status === 'PendingApproval' ? 'd' : 'n'}
          value={open ? open.label : '—'}
          label={open ? <ReleaseBadge status={open.status} /> : 'Open release'}
          onClick={() => setTab(reviewOnly ? 'review' : 'release')}
        />
      </MiniStats>

      <div className="card">
        <div className="utabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={(tab === t.key ? 'on' : '')}
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
        </>
      )}
    </div>
  )
}
