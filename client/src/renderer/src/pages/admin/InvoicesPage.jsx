import { useAuth } from '../../context/AuthContext'
import { usePermissions, can } from '../../api/permissionStore'
import InvoicesView from '../reception/InvoicesView'

// Hoá đơn thanh toán (Quản trị): CÙNG dữ liệu với Lễ tân (invoiceStore + hàng chờ) để số liệu luôn khớp.
// Quản trị viên xem / lọc / in báo cáo và huỷ hoá đơn (quyền invoice.void); thu tiền vẫn là việc của Lễ tân.
export default function InvoicesPage() {
  const { user } = useAuth()
  usePermissions()
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Payment invoices</h1>
          <p>Same invoices as Reception — revenue by period, payment method and status</p>
        </div>
      </div>
      <InvoicesView readOnly={false} canVoid={can(user.roleKey, 'invoice.void')} canCollect={false} />
    </div>
  )
}
