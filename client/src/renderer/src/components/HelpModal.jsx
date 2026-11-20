import Icon from './Icon'
import Modal, { ModalHeader } from './Modal'
import { translate } from '../i18n'

// Hộp Trợ giúp (F1 / ?): việc làm được theo vai trò + bảng phím tắt.

// Phím tắt: phần chung cho mọi vai trò + phần riêng từng vai trò.
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

// Một dòng phím tắt: từng phím thành <kbd>, chữ nối (“/”, “…”, “then”) để thường.
function KeyRow({ keys, text }) {
  return (
    <div className="keys-row">
      <span className="kbds">
        {keys.split(' ').map((p, i) =>
          p === '/' || p === '…' || p === 'then' ? (
            <span key={i} className="muted small">
              {translate(p)}
            </span>
          ) : (
            <kbd key={i}>{p}</kbd>
          )
        )}
      </span>
      <span>{translate(text)}</span>
    </div>
  )
}

export default function HelpModal({ open, onClose, user }) {
  const mine = SHORTCUTS[user.roleKey]
  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHeader title="Help" onClose={onClose} />
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
          {mine.length > 0 && (
            <div className="keys-col">
              <div className="keys-h">{translate('For your role')}</div>
              {mine.map(([k, d]) => (
                <KeyRow key={k} keys={k} text={d} />
              ))}
            </div>
          )}
          <div className="keys-col">
            <div className="keys-h">{translate('Everywhere')}</div>
            {SHORTCUTS_COMMON.map(([k, d]) => (
              <KeyRow key={k} keys={k} text={d} />
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
        <button className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </Modal>
  )
}
