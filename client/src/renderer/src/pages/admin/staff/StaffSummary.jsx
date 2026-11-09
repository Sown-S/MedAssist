import { ROLES } from '../../../api/accountStore'
import { IDLE_DAYS } from './staffShared'

// Dải ô đếm theo vai trò và trạng thái; bấm một ô để lọc bảng (bấm lại để bỏ lọc).
export default function StaffSummary({ counts, roleFilter, setRoleFilter, statusFilter, setStatusFilter }) {
  return (
    <div className="ai-summary">
      {Object.entries(ROLES).map(([k, r]) => (
        <button key={k} className={'stat-card ai-sum-card' + (roleFilter === k ? ' staff-sum-on' : '')} onClick={() => setRoleFilter(roleFilter === k ? 'all' : k)}>
          <div className="dot" />
          <div>
            <div className="val">{counts[k].total}</div>
            <div className="lbl">{r.label}</div>
            <div className="ai-small ai-soft">
              <span className="mono">{counts[k].active}</span> <span>active</span>
            </div>
          </div>
        </button>
      ))}
      <button className={'stat-card ai-sum-card' + (statusFilter === 'pending' ? ' staff-sum-on' : '')} onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}>
        <div className={'dot ' + (counts.pending ? 'amber' : '')} />
        <div>
          <div className="val">{counts.pending}</div>
          <div className="lbl">Password change pending</div>
        </div>
      </button>
      <button className={'stat-card ai-sum-card' + (statusFilter === 'locked' ? ' staff-sum-on' : '')} onClick={() => setStatusFilter(statusFilter === 'locked' ? 'all' : 'locked')}>
        <div className={'dot ' + (counts.locked ? 'red' : '')} />
        <div>
          <div className="val">{counts.locked}</div>
          <div className="lbl">Locked</div>
        </div>
      </button>
      <button className={'stat-card ai-sum-card' + (statusFilter === 'idle' ? ' staff-sum-on' : '')} onClick={() => setStatusFilter(statusFilter === 'idle' ? 'all' : 'idle')}>
        <div className={'dot ' + (counts.idle ? 'amber' : '')} />
        <div>
          <div className="val">{counts.idle}</div>
          <div className="lbl">
            <span>No sign-in for</span> <span className="mono">{IDLE_DAYS}</span> <span>days</span>
          </div>
        </div>
      </button>
    </div>
  )
}
