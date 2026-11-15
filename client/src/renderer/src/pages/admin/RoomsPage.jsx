import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { listRooms, createRoom, updateRoom, ROOM_TYPES } from '../../api/roomStore'
import { MiniStat, MiniStats } from '../../components/MiniStat'
import { ErrorNote } from '../../components/DataState'

const EMPTY = { code: '', name: '', type: 'Exam' }

// Mỗi phòng khám một bác sĩ cố định (gán ở Tài khoản nhân viên). Không xoá phòng, không đổi mã / loại — chỉ đổi tên và ngừng dùng.
export default function RoomsPage({ onNavigate }) {
  const { showToast } = useToast()
  const [rooms, setRooms] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null) // null = đóng; có id = đang đổi tên
  const [formErr, setFormErr] = useState('')

  async function refresh() {
    try {
      setRooms(await listRooms({ includeInactive: true }))
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
    const res = await updateRoom(r.id, { active: !r.active })
    if (!res.ok) return showToast(translate(res.error), 'error')
    showToast(r.active ? 'Room no longer in use' : 'Room back in use')
    refresh()
  }

  const exam = (rooms ?? []).filter((r) => r.type === 'Exam' && r.active)
  const free = exam.filter((r) => !r.physician).length

  return (
    <div>
      <div className="pg-h">
        <div>
          <h2>Rooms</h2>
          <p>Consultation rooms and the lab room. Each consultation room has one doctor, assigned in Staff accounts.</p>
        </div>
        <div className="act">
          <button className="btn btn-outline" onClick={() => onNavigate?.('staff')}>
            <Icon name="users" />
            {translate('Staff accounts')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setFormErr('')
              setForm({ ...EMPTY })
            }}
          >
            <Icon name="plus" />
            {translate('Add room')}
          </button>
        </div>
      </div>

      <ErrorNote tone="w">{error}</ErrorNote>

      {form && (
        <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
          <div className="card-title">{form.id ? translate('Rename room') + ' ' + form.code : translate('Add room')}</div>
          <div className="fg">
            <div className="field">
              <label>Code *</label>
              <input className="input" value={form.code} disabled={!!form.id} autoFocus={!form.id} placeholder="05" onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="field">
              <label>Name *</label>
              <input className="input" value={form.name} autoFocus={!!form.id} placeholder="Phòng khám 05" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Type</label>
              <select className="input" value={form.type} disabled={!!form.id} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(ROOM_TYPES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.id && <p className="muted small">The code and type of a room cannot be changed.</p>}
          {formErr && (
            <div className="banner d" style={{ marginBottom: 12 }}>
              {translate(formErr)}
            </div>
          )}
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
        <MiniStats>
          <MiniStat icon="door" value={exam.length} label="Consultation rooms in use" />
          <MiniStat icon="stethoscope" tone={free ? 'w' : 'n'} value={free} label="Rooms without a doctor" alert={free > 0} />
        </MiniStats>
      )}

      <div className="card">
        <div className="card-b">
          <div className="tbl-wrap">
            <table>
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
                    <td className="num">{r.code}</td>
                    <td>
                      <b>{r.name}</b>
                    </td>
                    <td>{translate(ROOM_TYPES[r.type] ?? r.type)}</td>
                    <td>{r.type !== 'Exam' ? <span className="muted">—</span> : r.physician ? r.physician.name : <span className="sp-warn">No doctor</span>}</td>
                    <td>{r.active ? <span className="plain">{translate('In use')}</span> : <span className="badge b-neutral">{translate('Not in use')}</span>}</td>
                    <td>
                      <div className="acts">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setFormErr('')
                            setForm({ id: r.id, code: r.code, name: r.name, type: r.type })
                          }}
                        >
                          <Icon name="pencil" />
                          {translate('Rename')}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle(r)}>
                          {translate(r.active ? 'Stop using' : 'Use again')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rooms && !rooms.length && <p className="muted small">No rooms yet.</p>}
        </div>
      </div>
    </div>
  )
}
