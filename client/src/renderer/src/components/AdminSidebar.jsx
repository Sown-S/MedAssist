import { useState } from 'react'
import Icon from './Icon'

// Cả cây menu là 1 mảng dữ liệu, KHÔNG phải chép tay từng <div> như bản HTML gốc.
// Muốn thêm/bớt mục menu sau này chỉ cần sửa mảng NAV, không đụng vào phần render bên dưới.
const NAV = [
  { id: 'dash', icon: 'home', label: 'Home' },
  {
    group: 'Patient management',
    icon: 'users',
    items: [
      { id: 'patients', label: 'Patient records' },
      { id: 'invoices', label: 'Payment invoices' }
    ]
  },
  { id: 'ai', icon: 'bulb', label: 'AI configuration' },
  { id: 'rooms', icon: 'stethoscope', label: 'Rooms' },
  { id: 'inventory', icon: 'box', label: 'Stock & expiry' },
  // Các danh mục (hành chính, y tế) mở từ trang trung tâm — sidebar chỉ giữ 1 mục để menu không phải cuộn.
  { id: 'catalog', icon: 'folder', label: 'Catalog management', match: (p) => p === 'drugs' || p.startsWith('cat-') },
  { id: 'history', icon: 'clock', label: 'Activity history' },
  { id: 'staff', icon: 'lock', label: 'Staff accounts' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
  { id: 'roadmap', icon: 'compass', label: 'Roadmap' }
]

export default function AdminSidebar({ page, onNavigate }) {
  const nav = NAV
  const [collapsed, setCollapsed] = useState(false)
  // Set lưu tên các group đang mở — mặc định mở sẵn "Quản lý bệnh nhân" giống bản gốc.
  const [openGroups, setOpenGroups] = useState(new Set(['Patient management']))

  function toggleGroup(name) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  return (
    <aside className={'admin-sidebar' + (collapsed ? ' collapsed' : '')}>
      <button className="sidebar-toggle" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
        <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} />
      </button>

      {nav.map((entry, i) =>
        entry.group ? (
          <div className={'side-group' + (openGroups.has(entry.group) ? ' open' : '')} key={i}>
            <div className="side-item" onClick={() => toggleGroup(entry.group)}>
              <span className="ic"><Icon name={entry.icon} /></span>
              <span className="lb">{entry.group}</span>
              <span className="chev">
  <Icon name="chevronRight" />
</span>
            </div>
            <div className="side-sub">
              {entry.items.map((it, j) =>
                it.subhead ? (
                  <div className="side-subhead" key={j}>
                    {it.subhead}
                  </div>
                ) : (
                  <div
                    key={j}
                    className={'side-subitem' + (page === it.id ? ' active' : '')}
                    title={it.label}
                    onClick={() => onNavigate(it.id)}
                  >
                    {it.label}
                  </div>
                )
              )}
            </div>
          </div>
        ) : (
          <div
            key={entry.id}
            className={'side-item' + (page === entry.id || entry.match?.(page) ? ' active' : '')}
            onClick={() => onNavigate(entry.id)}
          >
            <span className="ic"><Icon name={entry.icon} /></span>
            <span className="lb">{entry.label}</span>
          </div>
        )
      )}
    </aside>
  )
}
