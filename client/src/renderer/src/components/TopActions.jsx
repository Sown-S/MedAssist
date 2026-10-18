import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import Modal, { ModalHeader } from './Modal'
import { useToast } from '../context/ToastContext'
import { LANGUAGES, getLang, setLang, translate } from '../i18n'
import { useNavigate } from 'react-router-dom'
import { useQueue, isMine, inRoom, atLabs } from '../api/queueStore'
import { useInventory, stockOf } from '../api/inventoryStore'
import { soldOutside } from '../api/rxSafety'

// Thông báo tính từ dữ liệu thật (hàng chờ, kho) — khi có backend thật: GET /notifications hoặc đẩy qua WebSocket.
const hm = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })

const HELP = {
  doctor: [
    ['Consultation', 'Pick a patient from the queue, record SOAP notes, confirm the ICD-10 diagnosis and prescribe.'],
    ['Lab tests', 'Order lab tests from the consultation room and print the order sheet. The patient brings back paper results; note the key results before finalizing.'],
    ['Red-flag cases', 'Cases recorded by reception appear in red on top of your pages — decide whether to refer or see the patient at the clinic.'],
    ['Prescribing', 'Enter Morning / Noon / Afternoon / Evening doses and the number of days — quantity and directions fill in automatically. Children under 12 need a weight.'],
    ['Leaving & end of shift', 'Leaving the room: “Return to queue”. Patient gone: “Patient left”. Before going home: “End shift”.'],
    ['Keyboard shortcuts', 'Alt+N — call the next patient · Alt+L — order lab tests · Ctrl+Enter — finalize the visit']
  ],
  reception: [
    ['Reception', 'Register or find patients, check them in, follow the queue and collect payments.'],
    ['Keyboard shortcuts', 'F2 — register a new patient · F3 or Ctrl+K — find a patient']
  ],
  admin: [
    ['Reports', 'Revenue, visit counts and AI module performance.'],
    ['Admin', 'Manage inventory, catalogs, staff accounts, AI rules and the activity log.']
  ]
}

export default function TopActions({ user }) {
  const [open, setOpen] = useState(null) // 'bell' | 'help' | 'settings' | null
  const [unread, setUnread] = useState(true)
  const bellRef = useRef(null)
  const { redFlags, visits } = useQueue()
  const inv = useInventory()
  const navigate = useNavigate()
  const doctor = user.roleKey === 'doctor'
  const consult = (id) => '/doctor?view=consult' + (id ? '&visit=' + id : '')
  // Bác sĩ: việc cần làm ngay — luôn bật chấm đỏ cho tới khi xử lý xong.
  const live = doctor
    ? [
        ...redFlags.filter((r) => !r.doctorReview).map((r) => ({ id: r.id, title: translate('Red-flag case') + ' — ' + r.name, note: translate(r.signs) || '—', time: hm(r.at), urgent: true, to: '/doctor' })),
        ...visits
          .filter((v) => inRoom(v) && v.returnNote && isMine(v, user))
          .map((v) => ({ id: 'rt' + v.id, title: translate('Prescription sent back') + ' — ' + v.name, note: v.returnNote.text || translate('not enough stock, please change these drugs'), time: hm(v.returnNote.at), urgent: true, to: consult(v.id) })),
        ...visits
          .filter((v) => atLabs(v) && v.labReturnedAt && isMine(v, user))
          .map((v) => ({ id: 'lb' + v.id, title: translate('Back from lab') + ' — ' + v.name, note: translate('Results are ready — resume the visit'), time: hm(v.labReturnedAt), to: consult() }))
      ]
    : []
  // Mọi vai trò: thuốc hết / dưới ngưỡng tồn (tính từ kho thật).
  const low = inv.drugs.filter((d) => d.active && d.kind === 'drug' && !soldOutside(d) && stockOf(d, inv.batches).statuses.some((x) => x === 'out' || x === 'low'))
  const stock = low.length
    ? [{ id: 'stock', title: low.length + ' ' + translate('drugs low or out of stock'), note: low.slice(0, 4).map((d) => d.name).join(', ') + (low.length > 4 ? '…' : ''), time: '', to: doctor ? '/doctor?view=drugs' : null }]
    : []
  const notifications = [...live, ...stock]
  const { showToast } = useToast()

  function chooseLanguage(code) {
    if (code === getLang()) return
    setLang(code)
    showToast('Language updated')
  }

  // Đóng danh sách thông báo khi bấm ra ngoài.
  useEffect(() => {
    if (open !== 'bell') return
    const close = (e) => !bellRef.current?.contains(e.target) && setOpen(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <>
      <div className="notif-wrap" ref={bellRef}>
        <button
          className="icon-btn"
          title="Notifications"
          onClick={() => {
            setOpen(open === 'bell' ? null : 'bell')
            setUnread(false)
          }}
        >
          <Icon name="bell" />
          {(unread || live.length > 0) && <span className="dot" />}
        </button>
        {open === 'bell' && (
          <div className="notif-panel">
            <div className="notif-head">Notifications</div>
            {notifications.map((n) => (
              <div
                className={'notif-item' + (n.urgent ? ' urgent' : '') + (n.to ? ' clickable' : '')}
                key={n.id}
                onClick={() => {
                  if (!n.to) return
                  setOpen(null)
                  navigate(n.to)
                }}
              >
                <div>
                  <b>{n.title}</b>
                  <span>{n.note}</span>
                </div>
                <span className="time">{n.time}</span>
              </div>
            ))}
            {!notifications.length && <p className="ai-soft" style={{ fontSize: 13, padding: '8px 12px' }}>No notifications.</p>}
          </div>
        )}
      </div>
      <button className="icon-btn" title="Help" onClick={() => setOpen('help')}>
        <Icon name="help" />
      </button>
      <button className="icon-btn" title="Settings" onClick={() => setOpen('settings')}>
        <Icon name="settings" />
      </button>

      <Modal open={open === 'help'} onClose={() => setOpen(null)}>
        <ModalHeader title="Help" onClose={() => setOpen(null)} />
        <p className="help-intro">What you can do as {user.role}:</p>
        {HELP[user.roleKey].map(([name, text]) => (
          <div className="pref-row" key={name}>
            <b>{name}</b>
            <span>{text}</span>
          </div>
        ))}
        <p className="help-intro" style={{ marginTop: 14 }}>
          Forgot your password or need another account? Ask an administrator to reset or create it under Admin →
          Staff accounts.
        </p>
      </Modal>

      <Modal open={open === 'settings'} onClose={() => setOpen(null)}>
        <ModalHeader title="Settings" onClose={() => setOpen(null)} />
        <div className="section-label" style={{ marginTop: 0 }}>
          Account
        </div>
        {[
          ['Name', user.name],
          ['Username', user.username],
          ['Role', user.role]
        ].map(([k, v]) => (
          <div className="pref-row inline" key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
        <div className="section-label">Language</div>
        <div className="itabs" style={{ marginBottom: 0 }}>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              className={'itab' + (getLang() === l.code ? ' active' : '')}
              onClick={() => chooseLanguage(l.code)}
            >
              {l.name}
            </button>
          ))}
        </div>
        <p className="help-intro" style={{ marginTop: 10 }}>
          The display language is saved on this computer only. Times are shown in Vietnam time (GMT+7).
        </p>
      </Modal>
    </>
  )
}
