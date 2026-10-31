import { useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Modal, { ModalHeader } from '../components/Modal'
import AdminSidebar from '../components/AdminSidebar'
import DashboardPage from './admin/DashboardPage'
import PatientsPage from './admin/PatientsPage'
import InvoicesPage from './admin/InvoicesPage'
import AIConfigPage from './admin/AIConfigPage'
import InventoryPage from './admin/InventoryPage'
import CatalogPage from './admin/CatalogPage'
import DrugCatalogPage from './admin/DrugCatalogPage'
import CatalogDetailPage from './admin/catalogs/CatalogDetailPage'
import HistoryPage from './admin/HistoryPage'
import StaffPage from './admin/StaffPage'
import SettingsPage from './admin/SettingsPage'
import RoadmapPage from './admin/RoadmapPage'
import RoomsPage from './admin/RoomsPage'

const PAGES = {
  dash: DashboardPage,
  patients: PatientsPage,
  invoices: InvoicesPage,
  ai: AIConfigPage,
  inventory: InventoryPage,
  catalog: CatalogPage,
  drugs: DrugCatalogPage,
  history: HistoryPage,
  staff: StaffPage,
  settings: SettingsPage,
  roadmap: RoadmapPage,
  rooms: RoomsPage
}

export default function Admin() {
  const { user } = useAuth()
  // Bác sĩ vào khu Admin bằng tài khoản của mình chỉ thấy mục Duyệt tri thức (server ghi đúng người duyệt).
  const reviewer = user?.roleKey === 'doctor'
  const [page, setPage] = useState(reviewer ? 'ai-review' : 'dash')
  const [params, setParams] = useState(null)
  const Current = PAGES[page] ?? (page.startsWith('cat-') ? CatalogDetailPage : DashboardPage)
  // Trang có thay đổi chưa lưu đăng ký một hàm trả true khi đang dở → hỏi trước khi rời trang.
  const leaveGuard = useRef(null)
  const [pendingNav, setPendingNav] = useState(null)
  function go(id, p) {
    leaveGuard.current = null
    setPendingNav(null)
    setPage(id)
    setParams(p)
  }
  function navigate(id, p = null) {
    if (leaveGuard.current?.()) return setPendingNav({ id, p })
    go(id, p)
  }

  if (reviewer)
    return (
      <div className="page">
        <AIConfigPage reviewOnly />
      </div>
    )

  return (
    <div className="admin-shell">
      <AdminSidebar page={page} onNavigate={navigate} />
      <main className="admin-main">
        <Current
          key={page + JSON.stringify(params)}
          params={params}
          catalogKey={page.slice(4)}
          onNavigate={navigate}
          setLeaveGuard={(fn) => (leaveGuard.current = fn)}
        />
      </main>
      <Modal open={!!pendingNav} onClose={() => setPendingNav(null)}>
        <ModalHeader title="Unsaved changes" onClose={() => setPendingNav(null)} />
        <div className="modal-body">
          <p className="ai-soft">You have changes that have not been saved. Leave this page and discard them?</p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => setPendingNav(null)}>
            Stay on this page
          </button>
          <button className="btn btn-danger" onClick={() => go(pendingNav.id, pendingNav.p)}>
            Discard &amp; leave
          </button>
        </div>
      </Modal>
    </div>
  )
}
