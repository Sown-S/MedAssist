import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Icon, { Logo } from './Icon'
import { translate } from '../i18n'
import { useAdminNav } from '../context/AdminNavContext'
import { useQueue, isQueued, isMine, inRoom } from '../api/queueStore'
import { useServerOnline, useServerSlow } from '../api/connectivity'

// Thanh menu bên trái, dùng chung cho mọi vai trò. Lễ tân và Bác sĩ đổi màn bằng ?view= (như trước);
// Quản trị đổi trang qua AdminNavContext (vẫn hỏi trước khi rời trang có thay đổi chưa lưu).
const MENUS = {
  reception: {
    group: 'Receptionist',
    items: [
      { view: 'home', icon: 'dashboard', label: 'Home' },
      { view: 'queue', icon: 'users', label: 'Waiting queue', count: 'queue' },
      { view: 'patients', icon: 'contact', label: 'Patients' },
      { view: 'invoices', icon: 'banknote', label: 'Invoices & payments' },
      { view: 'prescriptions', icon: 'fileText', label: 'Prescriptions' }
    ]
  },
  doctor: {
    group: 'Doctor',
    items: [
      { view: 'home', icon: 'dashboard', label: 'Home' },
      { view: 'consult', icon: 'stethoscope', label: 'Consultation & Prescribing', count: 'room' },
      { view: 'prescriptions', icon: 'fileText', label: 'Prescriptions' },
      { view: 'drugs', icon: 'pill', label: 'Drug cabinet' },
      { view: 'patients', icon: 'contact', label: 'Patient records' }
    ],
    // Bác sĩ duyệt tri thức trong khu Admin bằng tài khoản của mình.
    extra: { group: 'Knowledge', items: [{ to: '/admin', icon: 'bulb', label: 'Knowledge review' }] }
  },
  admin: {
    groups: [
      {
        group: 'Overview',
        items: [
          { page: 'dash', icon: 'dashboard', label: 'Home' },
          { page: 'reports', icon: 'chart', label: 'Reports' }
        ]
      },
      {
        group: 'Operations',
        items: [
          { page: 'staff', icon: 'users', label: 'Staff accounts' },
          { page: 'rooms', icon: 'door', label: 'Rooms' },
          { page: 'catalog', icon: 'folder', label: 'Catalog management', match: (p) => p === 'drugs' || p.startsWith('cat-') },
          { page: 'inventory', icon: 'box', label: 'Stock & expiry' }
        ]
      },
      {
        group: 'System',
        items: [
          { page: 'ai', icon: 'bulb', label: 'AI configuration' },
          { page: 'history', icon: 'history', label: 'Activity history' },
          { page: 'settings', icon: 'settings', label: 'Settings' },
          { page: 'roadmap', icon: 'compass', label: 'Roadmap' }
        ]
      }
    ]
  }
}

const COLLAPSE_KEY = 'medassist_sidebar_collapsed'
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

// Tên mục đang mở — dùng làm tiêu đề trên thanh trên cùng.
export function useCurrentLabel(user) {
  const location = useLocation()
  const [params] = useSearchParams()
  const adminNav = useAdminNav()
  const role = user.roleKey
  const all = role === 'admin' ? MENUS.admin.groups.flatMap((g) => g.items) : [MENUS[role], MENUS[role].extra].filter(Boolean).flatMap((g) => g.items)
  const view = params.get('view') || 'home'
  const hit = all.find((it) =>
    it.page ? adminNav.page === it.page || it.match?.(adminNav.page) : it.to ? location.pathname === it.to : !location.pathname.startsWith('/admin') && view === it.view
  )
  return translate(hit?.label ?? 'Home')
}

export default function SideNav({ user }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const adminNav = useAdminNav()
  const { visits } = useQueue()
  const online = useServerOnline()
  const slow = useServerSlow()
  const role = user.roleKey

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* máy chặn lưu cục bộ: chỉ không nhớ trạng thái thu gọn */
    }
  }, [collapsed])

  const counts = {
    queue: role === 'reception' ? visits.filter(isQueued).length : 0,
    room: role === 'doctor' ? visits.filter((v) => inRoom(v) && isMine(v, user)).length : 0
  }
  const home = role === 'reception' ? '/reception' : '/doctor'
  const currentView = params.get('view') || 'home'

  const groups = role === 'admin' ? MENUS.admin.groups : [MENUS[role], MENUS[role].extra].filter(Boolean)
  const isActive = (it) => {
    if (it.page) return adminNav.page === it.page || it.match?.(adminNav.page)
    if (it.to) return location.pathname === it.to
    return location.pathname === home && currentView === it.view
  }
  const open = (it) => {
    if (it.page) return adminNav.navigate(it.page)
    if (it.to) return navigate(it.to)
    navigate(it.view === 'home' ? home : `${home}?view=${it.view}`)
  }

  return (
    <aside className={'side' + (collapsed ? ' collapsed' : '')}>
      <div className="side-brand">
        <Logo />
        <span className="t">
          Med<b>Assist</b>
        </span>
      </div>
      <button className="side-collapse" onClick={() => setCollapsed((v) => !v)} title={translate(collapsed ? 'Expand menu' : 'Collapse menu')} aria-label={translate(collapsed ? 'Expand menu' : 'Collapse menu')}>
        <Icon name="chevronsLeft" />
      </button>
      <nav className="side-scroll">
        {groups.map((g) => (
          <div key={g.group} className="side-grp">
            <div className="side-grp-t">{translate(g.group)}</div>
            {g.items.map((it) => {
              const n = it.count ? counts[it.count] : 0
              const label = translate(it.label)
              return (
                <button key={it.label} className={'nav' + (isActive(it) ? ' on' : '')} onClick={() => open(it)} data-tip={label} aria-current={isActive(it) ? 'page' : undefined}>
                  <Icon name={it.icon} />
                  <span className="t">{label}</span>
                  {n > 0 && <span className="cnt">{n}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      {role === 'doctor' &&
        (user.room ? (
          <div className="side-room" title={translate('Your consultation room')}>
            <Icon name="door" />
            <span className="t">{user.room}</span>
          </div>
        ) : (
          <div className="side-room warn" title={translate('Reception cannot direct patients to you until you have a room.')}>
            <Icon name="alert" />
            <span className="t">{translate('No room assigned — ask an administrator')}</span>
          </div>
        ))}
      <div className={'side-conn' + (online ? '' : ' bad')} role="status">
        <span className={'dot' + (online ? (slow ? ' warn' : ' live') : ' bad')} />
        <span className="t">{translate(!online ? 'Disconnected' : slow ? 'Slow response' : 'Connected')}</span>
      </div>
    </aside>
  )
}
