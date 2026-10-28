import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { listRooms, createRoom, updateRoom, ROOM_TYPES } from '../../api/roomStore'
import { listAccounts } from '../../api/accountStore'
import { DEMO_MODE } from '../../api/client'

const EMPTY = { code: '', name: '', type: 'Exam' }

// Quản trị › Phòng khám (ERD v1.9): phòng 01–03 khám, 04 xét nghiệm. Mỗi phòng khám một bác sĩ cố định,
// gán ở Tài khoản nhân viên. Không xóa phòng, không đổi mã / loại — chỉ đổi tên và ngừng dùng.
export default function RoomsPage({ onNavigate }) {
  const { showToast } = useToast()
  const [rooms, setRooms] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null) // null = đóng; có id = đang đổi tên
  const [formErr, setFormErr] = useState('')

  async function refresh() {
    try {
      setRooms(await listRooms({ includeInactive: true, accounts: DEMO_MODE ? await listAccounts() : [] }))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => {
    refresh()
  }, [])

  async function submit(e) {
    e.preventDefault()
    const res = form.id ? await updateRoom(form.id, { name: form.name }) : await createRoom(form)
    if (!res.ok) return setFormErr(res.error)
    showToast(form.id ? 'Room updated' : 'Room added')
    setForm(null)
    refresh()
  }
  async function toggle(r) {
    const res = await updateRoom(r.id, { active: !r.active }, { inUse: !!r.physician })
    if (!res.ok) return showToast(translate(res.error))
    showToast(r.active ? 'Room no longer in use' : 'Room back in use')
    refresh()
  }

  const exam = (rooms ?? []).filter((r) => r.type === 'Exam' && r.active)
  const free = exam.filter((r) => !r.physician).length

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Rooms</h1>
          <p>Consultation rooms and the lab room. Each consultation room has one doctor, assigned in Staff accounts.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => onNavigate?.('staff')}>
            <Icon name="lock" /> Staff accounts
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setFormErr('')
              setForm({ ...EMPTY })
            }}
          >
            + Add room
          </button>
        </div>
      </div>

      {error && <div className="warn-banner show">{error}</div>}

      {form && (
        <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
          <div className="card-title">{form.id ? translate('Rename room') + ' ' + form.code : translate('Add room')}</div>
          <div className="form-grid">
            <div className="field">
              <label>Code *</label>
              <input value={form.code} disabled={!!form.id} autoFocus={!form.id} placeholder="05" onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="field">
              <label>Name *</label>
              <input value={form.name} autoFocus={!!form.id} placeholder="Phòng khám 05" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={form.type} disabled={!!form.id} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(ROOM_TYPES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.id && <p className="login-note">The code and type of a room cannot be changed.</p>}
          {formErr && <div className="login-err show">{translate(formErr)}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Icon name="check" /> Save
            </button>
          </div>
        </form>
      )}

      {rooms && (
        <div className="stat-bar">
          <div className="stat-card">
            <div className="dot" />
            <div className="txt">
              <span className="val">{exam.length}</span>
              <span className="lbl">Consultation rooms in use</span>
            </div>
          </div>
          <div className="stat-card">
            <div className={'dot' + (free ? ' amber' : '')} />
            <div className="txt">
              <span className="val">{free}</span>
              <span className="lbl">Rooms without a doctor</span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <Icon name="stethoscope" /> Rooms <span className="cnt">{rooms?.length ?? 0}</span>
        </div>
        <table className="dt">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Doctor</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(rooms ?? []).map((r) => (
              <tr key={r.id} className={r.active ? '' : 'ai-dim'}>
                <td className="mono">{r.code}</td>
                <td>
                  <b>{r.name}</b>
                </td>
                <td>{translate(ROOM_TYPES[r.type] ?? r.type)}</td>
                <td>
                  {r.type !== 'Exam' ? (
                    <span className="ai-soft">—</span>
                  ) : r.physician ? (
                    r.physician.name
                  ) : (
                    <span className="sp-warn">No doctor</span>
                  )}
                </td>
                <td>{r.active ? <span className="badge ok">In use</span> : <span className="badge muted">Not in use</span>}</td>
                <td className="ai-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setFormErr('')
                      setForm({ id: r.id, code: r.code, name: r.name, type: r.type })
                    }}
                  >
                    Rename
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(r)}>
                    {r.active ? 'Stop using' : 'Use again'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rooms && !rooms.length && <p className="ai-soft">No rooms yet.</p>}
      </div>
    </div>
  )
}
