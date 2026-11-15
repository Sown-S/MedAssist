import { Fragment, useEffect, useState } from 'react'
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
      { view: 'home', icon: 'layout-dashboard', label: 'Home' },
      { view: 'queue', icon: 'users', label: 'Waiting queue', count: 'queue' },
      { view: 'patients', icon: 'contact-round', label: 'Patients' },
      { view: 'payments', icon: 'banknote', label: 'Dispensing & payment' },
      { view: 'invoices', icon: 'clipboard', label: 'Invoices' },
      { view: 'prescriptions', icon: 'file-text', label: 'Prescriptions' }
    ]
  },
  doctor: {
    group: 'Doctor',
    items: [
      { view: 'home', icon: 'layout-dashboard', label: 'Home' },
      {
        view: 'consult',
        icon: 'stethoscope',
        label: 'Consultation & Prescribing',
        count: 'room'
      },
      { view: 'prescriptions', icon: 'file-text', label: 'Prescriptions' },
      { view: 'drugs', icon: 'pill', label: 'Drug cabinet' },
      { view: 'patients', icon: 'folder-search', label: 'Patient records' }
    ],
    // Bác sĩ duyệt tri thức trong khu Admin bằng tài khoản của mình.
    extra: {
      group: 'Knowledge',
      items: [{ to: '/admin', icon: 'book-open-check', label: 'Knowledge review' }]
    }
  },
  admin: {
    groups: [
      {
        group: 'Overview',
        items: [
          { page: 'dash', icon: 'layout-dashboard', label: 'Home' },
          { page: 'reports', icon: 'bar-chart-3', label: 'Reports' }
        ]
      },
      {
        group: 'Operations',
        items: [
          { page: 'staff', icon: 'users', label: 'Staff accounts' },
          { page: 'rooms', icon: 'door-open', label: 'Rooms' },
          {
            page: 'catalog',
            icon: 'library',
            label: 'Catalog management',
            match: (p) => p === 'drugs' || p.startsWith('cat-')
          },
          { page: 'inventory', icon: 'package', label: 'Stock & expiry' }
        ]
      },
      {
        group: 'System',
        items: [
          { page: 'ai', icon: 'brain', label: 'AI configuration' },
          { page: 'history', icon: 'scroll-text', label: 'Activity history' },
          { page: 'settings', icon: 'settings', label: 'Settings' },
          { page: 'roadmap', icon: 'map', label: 'Roadmap' }
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
  const hit = all.find((it) => (it.page ? adminNav.page === it.page || it.match?.(adminNav.page) : it.to ? location.pathname === it.to : !location.pathname.startsWith('/admin') && view === it.view))
  return translate(hit?.label ?? 'Home')
}

// Trạng thái thu gọn menu nằm ở khung ngoài (.app.collapsed) giống bản mẫu.
export function useSideCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* máy chặn lưu cục bộ: chỉ không nhớ trạng thái thu gọn */
    }
  }, [collapsed])
  return [collapsed, setCollapsed]
}

export default function SideNav({ user, collapsed, onToggle }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const adminNav = useAdminNav()
  const { visits } = useQueue()
  const online = useServerOnline()
  const slow = useServerSlow()
  const role = user.roleKey

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

  const tip = translate(collapsed ? 'Expand menu' : 'Collapse menu')
  return (
    <aside className="side">
      <button className="collapse-btn" onClick={onToggle} title={tip} aria-label={tip}>
        <Icon name="chevrons-left" />
      </button>
      <div className="brand">
        <Logo />
        <span className="t">
          Med<b>Assist</b>
        </span>
      </div>
      <nav className="nav-scroll">
        {groups.map((g) => (
          <Fragment key={g.group}>
            <div className="grp-t">{translate(g.group)}</div>
            {g.items.map((it) => {
              const n = it.count ? counts[it.count] : 0
              const label = translate(it.label)
              const on = isActive(it)
              return (
                <a
                  key={it.label}
                  className={'nav' + (on ? ' on' : '')}
                  tabIndex={0}
                  role="link"
                  data-tip={label}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => open(it)}
                  onKeyDown={(e) => e.key === 'Enter' && open(it)}
                >
                  <Icon name={it.icon} />
                  <span className="t">{label}</span>
                  {n > 0 && <span className={'cnt' + (it.alert ? ' alert' : '')}>{n}</span>}
                </a>
              )
            })}
          </Fragment>
        ))}
      </nav>
      {role === 'doctor' &&
        (user.room ? (
          <div className="room" title={translate('Your consultation room')}>
            <Icon name="door-open" />
            <span className="t">{user.room}</span>
          </div>
        ) : (
          <div className="room warn" title={translate('Reception cannot direct patients to you until you have a room.')}>
            <Icon name="triangle-alert" />
            <span className="t">{translate('No room assigned — ask an administrator')}</span>
          </div>
        ))}
      <div className={'side-conn conn' + (online ? '' : ' bad')} role="status" title={translate('Server connection status')}>
        <span className={'dot' + (online ? (slow ? ' warn' : ' live') : ' bad')} />
        <span className="t">{translate(!online ? 'Disconnected' : slow ? 'Slow response' : 'Connected')}</span>
      </div>
    </aside>
  )
}
