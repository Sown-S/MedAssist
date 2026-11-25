import Icon from '../../../components/Icon'
import { ROLES, hasDefaultName, usePasswordPolicy } from '../../../api/accountStore'
import { translate } from '../../../i18n'
import { STATUS_FILTERS, isIdle } from './staffShared'
import { fmtDate, fmtDateTime } from '../../../utils/format'
import Badge from '../../../components/ui/Badge'

// Bảng tài khoản: tìm, lọc theo vai trò / trạng thái, và các thao tác trên từng dòng.
const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

export default function StaffTable({ rows, me, q, setQ, roleFilter, setRoleFilter, statusFilter, setStatusFilter, onEdit, onOwnPw, onUnlock, onReset, onToggle }) {
  const policy = usePasswordPolicy()
  return (
    <div className="card">
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, username, staff code, phone…" />
        </div>
        <div className="toolbar-r">
          <select className="select" aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            {Object.entries(ROLES).map(([k, r]) => (
              <option key={k} value={k}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="seg">
            {STATUS_FILTERS.map((f) => (
              <button key={f.key} className={statusFilter === f.key ? 'on' : ''} onClick={() => setStatusFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted">No accounts match.</p>
      ) : (
        <div className="tbl-wrap" tabIndex={0}>
          <table className="staff-table">
            <thead>
              <tr>
                <th>Full name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const self = a.id === me.id
                const idle = isIdle(a)
                return (
                  <tr key={a.id} className={a.active ? '' : 'ai-dim'}>
                    <td>
                      <span className="st-who">
                        <span className="avatar sm">{initials(a.fullName)}</span>
                        <span>
                          <b>{a.fullName}</b> {self && <Badge tone="success">You</Badge>}
                          {a.staffCode && <span className="small muted st-code num">{a.staffCode}</span>}
                        </span>
                      </span>
                      {hasDefaultName(a) && <div className="small sp-warn">Default name — change to a real person</div>}
                      {a.fullName.trim().toLowerCase() === a.username.toLowerCase() && <div className="small sp-warn">Name is the same as the username — enter the real full name</div>}
                      {a.roleKey === 'doctor' && (
                        <div className="small muted">
                          {a.roomName ? <span>{a.roomName}</span> : <span className="sp-warn">No room</span>}
                          {' · '}
                          {a.licenseNo ? (
                            <>
                              <span>Licence</span> <span className="num">{a.licenseNo}</span>
                            </>
                          ) : (
                            <span className="sp-warn">No licence no.</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="num">{a.username}</td>
                    <td>{ROLES[a.roleKey].label}</td>
                    <td className="num">{a.phone || '—'}</td>
                    <td>
                      <div className="staff-badges">
                        {!a.active ? (
                          <Badge tone="neutral">Disabled</Badge>
                        ) : a.locked ? (
                          <span className="badge b-danger" title={translate('Unlocks by itself at') + ' ' + fmtDateTime(a.lockedUntil)}>
                            Locked
                          </span>
                        ) : (
                          <span className="plain">Active</span>
                        )}
                        {a.mustChange && <Badge tone="warning">Password change pending</Badge>}
                        {a.active && !a.locked && a.failedAttempts > 0 && (
                          <span className="small sp-warn">
                            <span className="num">
                              {a.failedAttempts}
                              {policy && '/' + policy.maxFailed}
                            </span>{' '}
                            <span>failed sign-ins</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="small">
                      {a.lastLoginAt ? <span className="num">{fmtDateTime(a.lastLoginAt)}</span> : <span className="muted">Never signed in</span>}
                      {idle && <div className="sp-warn">Unused</div>}
                    </td>
                    <td className="small" title={a.createdBy ? translate('by') + ' ' + a.createdBy : undefined}>
                      <span className="num">{fmtDate(a.createdAt)}</span>
                    </td>
                    <td>
                      <div className="staff-actions">
                        {!self && a.locked && (
                          <button className="btn btn-primary btn-sm" onClick={() => onUnlock(a)}>
                            Unlock
                          </button>
                        )}
                        <button className="icon-btn" onClick={() => onEdit(a)} title={translate('Edit')} aria-label={translate('Edit')}>
                          <Icon name="pencil" />
                        </button>
                        {self ? (
                          <button className="icon-btn" onClick={onOwnPw} title={translate('Change password')} aria-label={translate('Change password')}>
                            <Icon name="key" />
                          </button>
                        ) : (
                          <>
                            <button className="icon-btn" onClick={() => onReset(a)} title={translate('Reset password')} aria-label={translate('Reset password')}>
                              <Icon name="key" />
                            </button>
                            <button
                              className={'icon-btn' + (a.active ? ' danger' : '')}
                              onClick={() => onToggle(a)}
                              title={translate(a.active ? 'Disable' : 'Enable')}
                              aria-label={translate(a.active ? 'Disable' : 'Enable')}
                            >
                              <Icon name={a.active ? 'ban' : 'circleCheck'} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
