import Icon from '../../../components/Icon'
import { ROLES, hasDefaultName, usePasswordPolicy } from '../../../api/accountStore'
import { fmtDate, fmtDateTime } from '../inventory/shared'
import { translate } from '../../../i18n'
import { STATUS_FILTERS, isIdle } from './staffShared'

// Bảng tài khoản: tìm, lọc theo vai trò / trạng thái, và các thao tác trên từng dòng.
export default function StaffTable({ rows, me, q, setQ, roleFilter, setRoleFilter, statusFilter, setStatusFilter, onEdit, onOwnPw, onUnlock, onReset, onToggle }) {
  const policy = usePasswordPolicy()
  return (
    <div className="card">
      <div className="ai-toolbar">
        <div className="ai-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, username, staff code, phone…" />
        </div>
        <div className="ai-toolbar-right">
          <select className="ai-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            {Object.entries(ROLES).map(([k, r]) => (
              <option key={k} value={k}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="ai-seg">
            {STATUS_FILTERS.map((f) => (
              <button key={f.key} className={statusFilter === f.key ? 'active' : ''} onClick={() => setStatusFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="ai-soft">No accounts match.</p>
      ) : (
        <div className="ai-table-wrap">
          <table className="dt staff-table">
            <thead>
              <tr>
                <th>Staff code</th>
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
                    <td className="mono">{a.staffCode || '—'}</td>
                    <td>
                      <b>{a.fullName}</b> {self && <span className="badge ok">You</span>}
                      {hasDefaultName(a) && <div className="ai-small sp-warn">Default name — change to a real person</div>}
                      {a.fullName.trim().toLowerCase() === a.username.toLowerCase() && (
                        <div className="ai-small sp-warn">Name is the same as the username — enter the real full name</div>
                      )}
                      {a.roleKey === 'doctor' && (
                        <div className="ai-small ai-soft">
                          {a.roomName ? <span>{a.roomName}</span> : <span className="sp-warn">No room</span>}
                          {' · '}
                          {a.licenseNo ? (
                            <>
                              <span>Licence</span> <span className="mono">{a.licenseNo}</span>
                            </>
                          ) : (
                            <span className="sp-warn">No licence no.</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="mono">{a.username}</td>
                    <td>{ROLES[a.roleKey].label}</td>
                    <td className="mono">{a.phone || '—'}</td>
                    <td>
                      <div className="staff-badges">
                        {!a.active ? <span className="badge muted">Disabled</span> : a.locked ? <span className="badge low" title={translate('Unlocks by itself at') + ' ' + fmtDateTime(a.lockedUntil)}>Locked</span> : <span className="badge ok">Active</span>}
                        {a.mustChange && <span className="badge warn">Password change pending</span>}
                        {a.active && !a.locked && a.failedAttempts > 0 && (
                          <span className="ai-small sp-warn">
                            <span className="mono">
                              {a.failedAttempts}
                              {policy && '/' + policy.maxFailed}
                            </span>{' '}
                            <span>failed sign-ins</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="ai-small">
                      {a.lastLoginAt ? <span className="mono">{fmtDateTime(a.lastLoginAt)}</span> : <span className="ai-soft">Never signed in</span>}
                      {idle && <div className="sp-warn">Unused</div>}
                    </td>
                    <td className="ai-small">
                      <span className="mono">{fmtDate(a.createdAt)}</span>
                      {a.createdBy && (
                        <div className="ai-soft">
                          <span>by</span> {a.createdBy}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="staff-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(a)}>
                          Edit
                        </button>
                        {self ? (
                          <button className="btn btn-ghost btn-sm" onClick={onOwnPw}>
                            Change password
                          </button>
                        ) : (
                          <>
                            {a.locked && (
                              <button className="btn btn-primary btn-sm" onClick={() => onUnlock(a)}>
                                Unlock
                              </button>
                            )}
                            <button className="btn btn-ghost btn-sm" onClick={() => onReset(a)}>
                              Reset password
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => onToggle(a)}>
                              {a.active ? 'Disable' : 'Enable'}
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
