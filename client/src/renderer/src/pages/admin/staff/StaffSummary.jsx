import { ROLES } from '../../../api/accountStore'
import { MiniStat, MiniStats } from '../../../components/MiniStat'
import { IDLE_DAYS } from './staffShared'

const ROLE_ICON = { doctor: 'stethoscope', reception: 'clipboard', admin: 'shieldCheck' }

// Dải ô đếm theo vai trò và trạng thái; bấm một ô để lọc bảng (bấm lại để bỏ lọc).
export default function StaffSummary({ counts, roleFilter, setRoleFilter, statusFilter, setStatusFilter }) {
  const toggleStatus = (k) => setStatusFilter(statusFilter === k ? 'all' : k)
  return (
    <MiniStats>
      {Object.entries(ROLES).map(([k, r]) => (
        <MiniStat key={k} icon={ROLE_ICON[k] ?? 'users'} value={counts[k].total} label={r.label} active={roleFilter === k} onClick={() => setRoleFilter(roleFilter === k ? 'all' : k)}>
          <span className="is-sub">
            <span className="mono">{counts[k].active}</span> <span>active</span>
          </span>
        </MiniStat>
      ))}
      <MiniStat icon="key" tone={counts.pending ? 'w' : 'n'} value={counts.pending} label="Password change pending" active={statusFilter === 'pending'} onClick={() => toggleStatus('pending')} />
      <MiniStat icon="lock" tone={counts.locked ? 'd' : 'n'} value={counts.locked} label="Locked" alert={counts.locked > 0} active={statusFilter === 'locked'} onClick={() => toggleStatus('locked')} />
      <MiniStat
        icon="clock"
        tone={counts.idle ? 'w' : 'n'}
        value={counts.idle}
        label={
          <>
            <span>No sign-in for</span> <span className="mono">{IDLE_DAYS}</span> <span>days</span>
          </>
        }
        active={statusFilter === 'idle'}
        onClick={() => toggleStatus('idle')}
      />
    </MiniStats>
  )
}
