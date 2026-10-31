import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { usePermissions, can } from '../../api/permissionStore'
import { DEMO_MODE } from '../../api/client'
import { ServerPending } from '../../components/DataState'
import Icon from '../../components/Icon'
import InvoicesView from '../reception/InvoicesView'

// Hoá đơn thanh toán (Quản trị): CÙNG dữ liệu với Lễ tân (invoiceStore + hàng chờ) để số liệu luôn khớp.
// Quản trị viên xem / lọc / in báo cáo và huỷ hoá đơn (quyền invoice.void); thu tiền vẫn là việc của Lễ tân.
// Backend thật: GET /billing/invoices chỉ cho Lễ tân (Admin nhận 403) → báo rõ và dẫn sang Báo cáo, không hiện hoá đơn mẫu.
export default function InvoicesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  usePermissions()
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Payment invoices</h1>
          <p>Same invoices as Reception — revenue by period, payment method and status</p>
        </div>
      </div>
      {DEMO_MODE ? (
        <InvoicesView readOnly={false} canVoid={can(user.roleKey, 'invoice.void')} canCollect={false} />
      ) : (
        <ServerPending
          title="The invoice list is not open to admin accounts yet"
          action={
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/reports')}>
              <Icon name="chart" /> View reports
            </button>
          }
        >
          The server only lets the reception desk read invoices. Until admin access is added, see revenue in Reports.
        </ServerPending>
      )}
    </div>
  )
}
