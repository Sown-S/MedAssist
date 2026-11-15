import { useAuth } from '../context/AuthContext'
import { useAdminNav } from '../context/AdminNavContext'
import DashboardPage from './admin/DashboardPage'
import KnowledgeLive from './admin/knowledge/KnowledgeLive'
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
  ai: KnowledgeLive,
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
  // Trang đang mở và cơ chế hỏi trước khi rời trang chưa lưu nằm ở AdminNavContext (menu bên trái dùng chung).
  const { page, params, navigate, setLeaveGuard } = useAdminNav()
  const Current = PAGES[page] ?? (page.startsWith('cat-') ? CatalogDetailPage : DashboardPage)

  if (reviewer)
    return (
      <div className="content view">
        <KnowledgeLive reviewOnly />
      </div>
    )

  return (
    <div className="content view admin-main">
      <Current key={page + JSON.stringify(params)} params={params} catalogKey={page.slice(4)} onNavigate={navigate} setLeaveGuard={setLeaveGuard} />
    </div>
  )
}
