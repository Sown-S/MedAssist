import Modal, { ModalHeader } from '../../../components/Modal'
import { ROLES } from '../../../api/accountStore'

// Tạo / sửa tài khoản. form = null là đóng; editing = tài khoản đang sửa (null khi tạo mới).
export default function AccountFormModal({ form, setForm, editing, me, rooms, formErr, onSubmit }) {
  return (
    <Modal open={!!form} onClose={() => setForm(null)}>
      {form && (
        <form onSubmit={onSubmit}>
          <ModalHeader title={editing ? `Edit account — ${editing.username}` : 'New account'} onClose={() => setForm(null)} />
          <div className="modal-body">
            {formErr && <div className="login-err show">{formErr}</div>}
            <div className="form-grid cols-2">
              <div className="field">
                <label>Full name</label>
                <input value={form.fullName} autoFocus onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div className="field">
                <label>Username</label>
                <input value={form.username} disabled={!!editing} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="field">
                <label>Role</label>
                <select value={form.roleKey} disabled={editing?.id === me.id} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
                  {Object.entries(ROLES).map(([k, r]) => (
                    <option key={k} value={k}>
                      {r.label}
                      {k === 'admin' && !editing ? ' (secondary admin)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              {editing && (
                <div className="field">
                  <label>Staff code</label>
                  <input value={form.staffCode} onChange={(e) => setForm({ ...form, staffCode: e.target.value })} />
                </div>
              )}
              {form.roleKey === 'doctor' && (
                <>
                  <div className="field">
                    <label>Consultation room</label>
                    <select value={form.roomId ?? ''} onChange={(e) => setForm({ ...form, roomId: e.target.value || null })}>
                      <option value="">— Not assigned —</option>
                      {rooms.map((r) => {
                        // Phòng đã có bác sĩ khác → không chọn được (server: 409 ROOM_TAKEN)
                        const taken = r.physician && r.physician.id !== form.id
                        return (
                          <option key={r.id} value={r.id} disabled={!!taken}>
                            {r.name}
                            {taken ? ' — ' + r.physician.name : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  <div className="field">
                    <label>Practising licence no.</label>
                    <input value={form.licenseNo} onChange={(e) => setForm({ ...form, licenseNo: e.target.value })} placeholder="Printed on prescriptions" />
                  </div>
                </>
              )}
            </div>
            {editing?.id === me.id && <p className="login-note">You cannot change your own role — ask another administrator.</p>}
            {editing && form.roleKey !== editing.roleKey && (
              <p className="login-note sp-warn">
                <span>Role change:</span> <span>{ROLES[editing.roleKey].label}</span> → <span>{ROLES[form.roleKey].label}</span>.{' '}
                <span>You will be asked for your password.</span>
              </p>
            )}
            {!editing && <p className="login-note">A temporary password is generated after you create the account — it is shown once so you can send it to the staff member.</p>}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Save' : 'Create account'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
