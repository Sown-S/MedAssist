import { useState } from 'react'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { useAIConfig } from '../../api/aiConfigStore'
import { RULE_TYPES, fmtTime } from './ai/catalog'
import { isLive } from './ai/ruleEngine'
import RulesTab from './ai/RulesTab'
import TesterTab from './ai/TesterTab'
import ReviewTab from './ai/ReviewTab'
import MetricsTab from './ai/MetricsTab'
import SettingsTab from './ai/SettingsTab'
import KnowledgeLive from './knowledge/KnowledgeLive'
import { DEMO_MODE } from '../../api/client'

const TABS = [
  { key: 'rules', label: 'Rules' },
  { key: 'test', label: 'Rule tester' },
  { key: 'review', label: 'Review queue' },
  { key: 'metrics', label: 'Effectiveness' },
  { key: 'settings', label: 'Module settings' }
]

// Backend thật: tri thức OKF ở server, duyệt theo bản phát hành (knowledge/KnowledgeLive). Chế độ giả lập giữ các tab demo bên dưới.
export default function AIConfigPage({ reviewOnly = false }) {
  if (!DEMO_MODE) return <KnowledgeLive reviewOnly={reviewOnly} />
  return <AIConfigDemo reviewOnly={reviewOnly} />
}

// reviewOnly: bác sĩ vào khu Admin bằng tài khoản của mình — chỉ thấy hàng duyệt tri thức (không sửa quy tắc, không cài đặt).
function AIConfigDemo({ reviewOnly = false }) {
  const [tab, setTab] = useState(reviewOnly ? 'review' : 'rules')
  const { user } = useAuth()
  const cfg = useAIConfig()
  const me = { name: user?.name ?? 'Unknown', username: user?.username ?? '', roleKey: user?.roleKey }
  if (reviewOnly) {
    const waiting = cfg.rules.filter((r) => r.pending?.stage === 'review')
    const liveRules = cfg.rules.filter(isLive)
    const lastApproved = cfg.audit.find((a) => a.action === 'Approved & applied')
    return (
      <div className="review-page">
        <div className="page-head">
          <div>
            <h1>Knowledge review</h1>
            <p>Approve or reject changes to the clinical rules drafted by the administrator — you cannot approve your own drafts</p>
          </div>
          <span className={'badge ' + (waiting.length ? 'warn' : 'ok')}>
            {waiting.length ? waiting.length + ' ' + translate('waiting for you') : translate('Nothing to review')}
          </span>
        </div>
        <div className="ai-summary review-summary">
          <div className="stat-card">
            <div className={'dot ' + (waiting.length ? 'red' : '')} />
            <div>
              <div className="val">{waiting.length}</div>
              <div className="lbl">Waiting for review</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="dot" />
            <div>
              <div className="val">{liveRules.length}</div>
              <div className="lbl">Rules in use</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="dot red" />
            <div>
              <div className="val">{liveRules.filter((r) => r.type === 'redflag').length}</div>
              <div className="lbl">Red-flag rules in use</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="dot" />
            <div>
              <div className="lbl">Last approval</div>
              <div className="ai-last">{lastApproved ? fmtTime(lastApproved.at) : '—'}</div>
              {lastApproved && (
                <div className="ai-small ai-soft">
                  {lastApproved.by} · <span className="mono">{lastApproved.target}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <ReviewTab rules={cfg.rules} audit={cfg.audit} user={me} />
      </div>
    )
  }

  const rules = cfg.rules
  const live = rules.filter(isLive)
  const disabled = rules.filter((r) => r.version > 0 && !r.enabled && !r.retired)
  const pending = rules.filter((r) => r.pending)
  const awaiting = pending.filter((r) => r.pending.stage === 'review').length
  const lastChange = cfg.audit[0]

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>AI configuration &amp; CDSS rules</h1>
          <p>Clinical rules (red flags, priority floor) and settings of the decision-support module</p>
        </div>
        <span className={'badge ' + (cfg.settings.enabled ? 'ok' : 'low')}>{cfg.settings.enabled ? 'AI module on' : 'AI module off'}</span>
      </div>

      <div className="ai-box ai-disclaimer">
        <div className="icon">
          <Icon name="alert" />
        </div>
        <div className="content">
          <b>AI suggestions are for reference only and must be confirmed by a doctor.</b>{' '}
          <span>Nothing is written to the medical record until the doctor confirms it.</span>
        </div>
      </div>

      <div className="ai-summary">
        {RULE_TYPES.map((t) => (
          <button key={t.key} className="stat-card ai-sum-card" onClick={() => setTab('rules')}>
            <div className={'dot ' + (t.key === 'redflag' ? 'red' : t.key === 'priority' ? 'amber' : '')} />
            <div>
              <div className="val">{live.filter((r) => r.type === t.key).length}</div>
              <div className="lbl">{t.label}</div>
            </div>
          </button>
        ))}
        <div className="stat-card" title={disabled.map((r) => r.id).join(', ')}>
          <div className={'dot ' + (disabled.length ? 'amber' : '')} />
          <div>
            <div className="val">{disabled.length}</div>
            <div className="lbl">Rules turned off</div>
            {disabled.length > 0 && <div className="ai-small mono ai-soft">{disabled.map((r) => r.id).join(', ')}</div>}
          </div>
        </div>
        <button className="stat-card ai-sum-card" onClick={() => setTab('review')}>
          <div className={'dot ' + (awaiting ? 'red' : '')} />
          <div>
            <div className="val">{pending.length}</div>
            <div className="lbl">Pending changes</div>
            <div className="ai-small ai-soft">
              <span className="mono">{awaiting}</span> <span>awaiting a doctor</span>
            </div>
          </div>
        </button>
        <div className="stat-card">
          <div className="dot" />
          <div>
            <div className="lbl">Last change</div>
            <div className="ai-last">{lastChange ? fmtTime(lastChange.at) : '—'}</div>
            {lastChange && (
              <div className="ai-small ai-soft">
                {lastChange.by} · <span className="mono">{lastChange.target}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="itabs ai-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={'itab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
              <span>{t.label}</span>
              {t.key === 'review' && pending.length > 0 && <span className="ai-count alert">{pending.length}</span>}
            </button>
          ))}
        </div>

        {tab === 'rules' && <RulesTab rules={rules} audit={cfg.audit} user={me} onOpenReview={() => setTab('review')} />}
        {tab === 'test' && <TesterTab rules={rules} settings={cfg.settings} synonyms={cfg.synonyms} required={cfg.required} />}
        {tab === 'review' && <ReviewTab rules={rules} audit={cfg.audit} user={me} />}
        {tab === 'metrics' && <MetricsTab rules={rules} />}
        {tab === 'settings' && <SettingsTab settings={cfg.settings} user={me} />}
      </div>
    </div>
  )
}
