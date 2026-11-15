import { useState } from 'react'
import Icon from '../../../components/Icon'
import { LoadingBlock, ErrorBlock } from '../../../components/DataState'
import { translate } from '../../../i18n'
import { OPEN_STATUSES } from '../../../api/knowledgeApi'
import { useAuth } from '../../../context/AuthContext'
import ItemsTab from './ItemsTab'
import ReleaseTab from './ReleaseTab'
import { ReviewPanel } from './ReviewPanel'
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
        <ErrorBlock message={errorText(error)} />
        <button className="btn btn-ghost btn-sm" onClick={reload}>
          Try again
        </button>
      </div>
    )
  if (!data) return <LoadingBlock />

  const active = data.releases.find((r) => r.status === 'Active')
  const open = data.releases.find((r) => OPEN_STATUSES.includes(r.status))
  const rules = groupByKey(data.items.rules).filter((g) => g.active)
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
        {reviewOnly && active && (
          <span className="badge b-success">
            <span>In use:</span> <span className="num">{active.label}</span>
          </span>
        )}
      </div>

      {!reviewOnly && (
        <div className="banner i">
          <Icon name="info" />
          <div className="txt">
            <b>
              <span>In use:</span> <span className="num">{active ? active.label : '—'}</span>
            </b>
            <span>AI suggestions are for reference only and must be confirmed by a doctor.</span>
          </div>
        </div>
      )}

      {!reviewOnly && (
        <div className="grid-2e">
          {[
            ['RED_FLAG', 'Red-flag rules in use', 'siren', 'd'],
            ['PRIORITY_FLOOR', 'Priority-floor rules in use', 'arrow-up', 'w']
          ].map(([type, title, icon, tone]) => {
            const list = rules.filter((g) => g.active.values.rule_type === type)
            return (
              <div className="card" key={type}>
                <div className="card-h">
                  <h3>
                    <Icon name={type === 'RED_FLAG' ? 'siren' : 'arrow-up-narrow-wide'} />
                    {translate(title)}
                  </h3>
                  <span className="plain">
                    {list.length} {translate('rules')}
                  </span>
                </div>
                <div className="card-b">
                  <div className="rows">
                    {list.map((g) => (
                      <div className="r" key={g.key}>
                        <div className={'ico ' + tone} style={{ width: 30, height: 30 }}>
                          <Icon name={icon} />
                        </div>
                        <div className="t">
                          <b>{g.active.values.rule_name || g.key}</b>
                          <span>{g.active.values.reason_text}</span>
                        </div>
                      </div>
                    ))}
                    {!list.length && <p className="muted small">—</p>}
                  </div>
                  {type === 'RED_FLAG' && (
                    <p className="muted small" style={{ marginTop: 10 }}>
                      Red-flag and priority-floor rules are decided by these rules alone, never by the AI model.
                    </p>
                  )}
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
          <div className="card">
            <div className="utabs">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  className={tab === t.key ? 'on' : ''}
                  onClick={() => {
                    setTab(t.key)
                    setAskRelease(0)
                  }}
                >
                  <span>{t.label}</span>
                  {t.key === 'review' && open?.status === 'PendingApproval' && (
                    <span className="badge b-danger" style={{ marginLeft: 6 }}>
                      1
                    </span>
                  )}
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
          <p className="muted small foot-note">
            <Icon name="alert" />{' '}
            <span>{translate('Knowledge is authored in Obsidian (OKF) and imported with import_okf, or edited here. Every change is versioned and written to the activity log.')}</span>
          </p>
        </>
      )}
    </div>
  )
}
