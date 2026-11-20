import { Fragment, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import Modal, { ModalHeader } from './Modal'
import ChangePasswordModal from './ChangePasswordModal'
import { LANGUAGES, getLang, setLang, translate } from '../i18n'
import { useNavigate } from 'react-router-dom'
import { useQueue, isMine, inRoom, atLabs, isPendingFlag } from '../api/queueStore'
import { useInventory, stockOf } from '../api/inventoryStore'
import SettingsModal from './SettingsModal'
import Clip from './Clip'
import { OPEN_EVENT } from './useGlobalKeys'

// Thông báo tính tại máy từ hàng chờ và kho.
const hm = (iso) =>
  new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

// Phím tắt theo vai trò — hiện thành bảng phím trong hộp Trợ giúp.
// Bảng phím tắt trong Trợ giúp: phần chung cho mọi vai trò + phần riêng từng vai trò.
const SHORTCUTS_COMMON = [
  ['Alt+1 … Alt+9', 'Open menu item 1 … 9'],
  ['Ctrl+B', 'Collapse / expand the menu bar'],
  ['Ctrl+F', 'Jump to the search box on the page'],
  ['Ctrl+S', 'Save the form that is open'],
  ['↑ ↓ ← →', 'Move between items in a list, tabs or button group'],
  ['Enter', 'Open / choose the highlighted item'],
  ['Esc', 'Close the dialog'],
  ['F1 / ?', 'Open help & shortcuts'],
  ['Ctrl+,', 'Open settings']
]
const SHORTCUTS = {
  doctor: [
    ['Alt+N', 'Call next patient'],
    ['Alt+T', 'Jump to the drug search box'],
    ['Alt+D', 'Accept the top AI suggestion'],
    ['Alt+L', 'Order lab tests'],
    ['Ctrl+Enter', 'Finalize the visit'],
    ['Ctrl+Shift+Enter', 'Finalize and call the next patient']
  ],
  reception: [
    ['F2', 'Register new patient'],
    ['F3 / Ctrl+K', 'Find patient'],
    ['↓ then Enter', 'In Find patient: pick a result and check in']
  ],
  admin: []
}
const HELP_ICON = {
  Consultation: 'stethoscope',
  'Lab tests': 'flask',
  'Red-flag cases': 'siren',
  Prescribing: 'fileText',
  'Your room': 'door',
  Reception: 'users',
  Reports: 'chart',
  Admin: 'settings'
}

const HELP = {
  doctor: [
    ['Consultation', 'Pick a patient from the queue, record SOAP notes, confirm the ICD-10 diagnosis and prescribe.'],
    ['Lab tests', 'Order lab tests from the consultation room and print the order sheet. The patient brings back paper results; note the key results before finalizing.'],
    ['Red-flag cases', 'Cases recorded by reception appear in red on top of your pages — decide whether to refer or see the patient at the clinic.'],
    ['Prescribing', 'Enter Morning / Noon / Afternoon / Evening doses and the number of days — quantity and directions fill in automatically. Children under 12 need a weight.'],
    ['Your room', 'Each doctor works in a fixed room set by the administrator in Staff accounts — no shifts to start or end. Leaving the room: “Return to queue”. Patient gone: “Patient left”.']
  ],
  reception: [['Reception', 'Register or find patients, check them in, follow the queue and collect payments.']],
  admin: [
    ['Reports', 'Revenue, visit counts and AI module performance.'],
    ['Admin', 'Manage inventory, catalogs, staff accounts, AI rules and the activity log.']
  ]
}

export default function TopActions({ user, onSignOut }) {
  const [open, setOpen] = useState(null)
  const [unread, setUnread] = useState(true)
  const bellRef = useRef(null)
  const langRef = useRef(null)
  const acctRef = useRef(null)
  const { redFlags, visits, stale = [] } = useQueue()
  const inv = useInventory()
  const navigate = useNavigate()
  const doctor = user.roleKey === 'doctor'
  const consult = (id) => '/doctor?view=consult' + (id ? '&visit=' + id : '')
  // Bác sĩ: chấm đỏ luôn bật tới khi xử lý xong việc cần làm ngay.
  const live = doctor
    ? [
        ...redFlags
          .filter((r) => isPendingFlag(r) && !r.doctorReview)
          .map((r) => ({
            id: r.id,
            icon: 'siren',
            title: translate('Red-flag case') + ' — ' + r.name,
            note: translate(r.signs) || '—',
            time: hm(r.at),
            urgent: true,
            to: '/doctor'
          })),
        ...visits
          .filter((v) => inRoom(v) && v.returnNote && isMine(v, user))
          .map((v) => ({
            id: 'rt' + v.id,
            icon: 'fileText',
            title: translate('Prescription sent back') + ' — ' + v.name,
            note: v.returnNote.text || translate('not enough stock, please change these drugs'),
            time: hm(v.returnNote.at),
            urgent: true,
            to: consult(v.id)
          })),
        ...visits
          .filter((v) => atLabs(v) && v.labReturnedAt && isMine(v, user))
          .map((v) => ({
            id: 'lb' + v.id,
            icon: 'flask',
            title: translate('Back from lab') + ' — ' + v.name,
            note: translate('Results are ready — resume the visit'),
            time: hm(v.labReturnedAt),
            to: consult()
          }))
      ]
    : user.roleKey === 'reception'
      ? [
          // Lễ tân: ca cờ đỏ chưa hướng dẫn xong và lượt tồn từ ngày trước nằm trong danh sách của chuông.
          ...(stale.length
            ? [
                {
                  id: 'stale',
                  icon: 'history',
                  title: stale.length + ' ' + translate('open visits from previous days'),
                  note: translate('Close them with a reason, or collect payment if the patient came back.'),
                  time: '',
                  urgent: true,
                  to: '/reception?stale=1'
                }
              ]
            : []),
          ...redFlags
            .filter((r) => isPendingFlag(r) && !r.ack)
            .map((r) => ({
              id: r.id,
              icon: 'siren',
              title: translate('Red-flag case') + ' — ' + r.name,
              note: translate(r.signs) || '—',
              time: hm(r.at),
              urgent: true,
              to: '/reception?view=queue'
            }))
        ]
      : []
  const low = inv.drugs.filter((d) => d.active && d.kind === 'drug' && stockOf(d, inv.batches).statuses.some((x) => x === 'out' || x === 'low'))
  const stock = low.length
    ? [
        {
          id: 'stock',
          title: low.length + ' ' + translate('drugs low or out of stock'),
          note:
            low
              .slice(0, 4)
              .map((d) => d.name)
              .join(', ') + (low.length > 4 ? '…' : ''),
          time: '',
          to: doctor ? '/doctor?view=drugs' : null
        }
      ]
    : []
  const notifications = [...live, ...stock]
  // Đổi ngôn ngữ: giao diện đổi ngay, không hiện thông báo.
  function chooseLanguage(code) {
    if (code !== getLang()) setLang(code)
  }

  // Phím tắt chung (F1 / ? → Trợ giúp, Ctrl+, → Cài đặt).
  useEffect(() => {
    const on = (e) => setOpen(e.detail)
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [])

  // Các menu thả xuống (chuông, ngôn ngữ, tài khoản) đóng khi bấm ra ngoài.
  useEffect(() => {
    const ref = { bell: bellRef, lang: langRef, acct: acctRef }[open]
    if (!ref) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const ib = (icon, tip, onClick) => (
    <button className="btn btn-ghost btn-icon" title={translate(tip)} aria-label={translate(tip)} onClick={onClick}>
      <Icon name={icon} />
    </button>
  )

  return (
    <>
      <div className="tb bell" ref={bellRef}>
        <button
          className="btn btn-ghost btn-icon"
          title={translate('Notifications')}
          aria-label={translate('Notifications')}
          aria-haspopup="dialog"
          aria-expanded={open === 'bell'}
          onClick={() => {
            setOpen(open === 'bell' ? null : 'bell')
            setUnread(false)
          }}
        >
          <Icon name="bell" />
        </button>
        {(unread || live.length > 0) && notifications.length > 0 && <span className="badge-dot" />}
        {open === 'bell' && (
          <div className="menu open bell-menu">
            <div className="bell-scroll">
              <div className="mh">Notifications</div>
              {notifications.map((n) => (
                <div
                  className="ni"
                  key={n.id}
                  style={n.to ? { cursor: 'pointer' } : undefined}
                  onClick={() => {
                    if (!n.to) return
                    setOpen(null)
                    navigate(n.to)
                  }}
                >
                  <div className={'ico ' + (n.urgent ? 'd' : n.icon ? 'n' : 'w')} style={{ width: 30, height: 30 }}>
                    <Icon name={n.icon ?? 'package-x'} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Clip as="b" title={n.title}>
                      {n.title}
                    </Clip>
                    <Clip lines={2} className="muted" title={n.title} full={n.note + (n.time ? ' · ' + n.time : '')}>
                      {n.note}
                      {n.time ? ' · ' + n.time : ''}
                    </Clip>
                  </div>
                </div>
              ))}
              {!notifications.length && <div className="ni muted">No notifications.</div>}
            </div>
          </div>
        )}
      </div>
      <div className="tb" ref={langRef}>
        {ib('languages', 'Language', () => setOpen(open === 'lang' ? null : 'lang'))}
        {open === 'lang' && (
          <div className="menu open">
            <div className="mh">Language</div>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                className={getLang() === l.code ? 'on' : ''}
                onClick={() => {
                  setOpen(null)
                  chooseLanguage(l.code)
                }}
              >
                <Icon name={getLang() === l.code ? 'check' : 'globe'} />
                <span>{l.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tb">{ib('circle-help', 'Help', () => setOpen('help'))}</div>
      <div className="tb">{ib('settings', 'Settings', () => setOpen('settings'))}</div>
      <div className="tb" ref={acctRef}>
        <button className="acct" onClick={() => setOpen(open === 'acct' ? null : 'acct')} aria-haspopup="menu" aria-expanded={open === 'acct'}>
          <div className="ava">{user.av}</div>
          <div className="who">
            <b>{user.name}</b>
            <span>{user.role}</span>
          </div>
          <Icon name="chevron-down" />
        </button>
        {open === 'acct' && (
          <div className="menu open" role="menu">
            <div className="mh">Account</div>
            <button role="menuitem" onClick={() => setOpen('password')}>
              <Icon name="key-round" />
              <span>Change password</span>
            </button>
            <hr />
            <button
              role="menuitem"
              className="logout-btn"
              style={{ color: 'var(--danger)' }}
              onClick={() => {
                setOpen(null)
                onSignOut?.()
              }}
            >
              <Icon name="log-out" />
              Sign out
            </button>
          </div>
        )}
      </div>

      <Modal open={open === 'help'} onClose={() => setOpen(null)} wide>
        <ModalHeader title="Help" onClose={() => setOpen(null)} />
        <div className="modal-b">
          <p className="help-intro">What you can do as {user.role}:</p>
          {HELP[user.roleKey].map(([name, text]) => (
            <div className="help-sec" key={name}>
              <span className="ico p">
                <Icon name={HELP_ICON[name] ?? 'help'} />
              </span>
              <span>
                <b>{translate(name)}</b>
                <span>{translate(text)}</span>
              </span>
            </div>
          ))}
          <div className="sec-t">Keyboard shortcuts</div>
          <div className="keys-grid">
            {SHORTCUTS[user.roleKey].length > 0 && (
              <div className="keys-col">
                <div className="keys-h">{translate('For your role')}</div>
                {SHORTCUTS[user.roleKey].map(([k, d]) => (
                  <div className="keys-row" key={k}>
                    <span className="kbds">
                      {k.split(' ').map((p, i) =>
                        p === '/' || p === '…' || p === 'then' ? (
                          <span key={i} className="muted small">
                            {translate(p)}
                          </span>
                        ) : (
                          <kbd key={i}>{p}</kbd>
                        )
                      )}
                    </span>
                    <span>{translate(d)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="keys-col">
              <div className="keys-h">{translate('Everywhere')}</div>
              {SHORTCUTS_COMMON.map(([k, d]) => (
                <div className="keys-row" key={k}>
                  <span className="kbds">
                    {k.split(' ').map((p, i) =>
                      p === '/' || p === '…' ? (
                        <span key={i} className="muted small">
                          {p}
                        </span>
                      ) : (
                        <kbd key={i}>{p}</kbd>
                      )
                    )}
                  </span>
                  <span>{translate(d)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="help-tips">
            <span className="help-tip">
              <Icon name="arrow-right-left" />
              {translate('Use Tab / Shift+Tab to go to the next / previous box')}
            </span>
            <span className="help-tip">
              <Icon name="key-round" />
              {translate('Forgot your password or need another account? Ask an administrator to reset or create it under Admin')}
            </span>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn btn-primary" onClick={() => setOpen(null)}>
            Got it
          </button>
        </div>
      </Modal>

      <SettingsModal open={open === 'settings'} onClose={() => setOpen(null)} user={user} onChangePassword={() => setOpen('password')} />

      <ChangePasswordModal open={open === 'password'} onClose={() => setOpen(null)} />
    </>
  )
}
