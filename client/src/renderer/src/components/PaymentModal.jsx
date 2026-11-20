import { useCallback, useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import Icon from './Icon'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useServiceCatalog } from '../api/serviceStore'
import { fetchServiceOrders } from '../api/serviceApi'
import CancelOrderItemModal from './CancelOrderItemModal'
import { getPrescription } from '../api/examApi'
import { getInvoice } from '../api/billingApi'
import { syncQueue } from '../api/queueStore'
import { translate } from '../i18n'
import DispenseTab from './payment/DispenseTab'
import InvoiceItems from './payment/InvoiceItems'
import PaymentSummary from './payment/PaymentSummary'
import Skeleton from './Skeleton'

// Cấp phát và thu tiền khi chạy với server: mọi thao tác gọi API rồi tải lại — server là nguồn sự thật.
// Dòng cận lâm sàng sinh từ phiếu chỉ định (service_order_id) quầy không sửa, chỉ huỷ chỉ định;
// chỉ định ngoài danh mục chưa có giá nằm ở unbilled_items để quầy thêm tay.

export default function PaymentModal({ open, onClose, patient, initialTab = 'dispense' }) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const cat = useServiceCatalog()
  const [orders, setOrders] = useState([])
  const [cancelLine, setCancelLine] = useState(null)
  const [rx, setRx] = useState(null)
  const [inv, setInv] = useState(undefined) // undefined = đang tải, null = không có hoá đơn
  const [err, setErr] = useState('')
  const [tab, setTab] = useState(initialTab === 'pay' ? 'pay' : 'dispense')
  const visitId = patient?.id

  const load = useCallback(async () => {
    try {
      const [p, i, o] = await Promise.all([getPrescription(visitId), getInvoice(visitId), fetchServiceOrders(visitId)])
      setRx(p)
      setInv(i)
      setOrders(o)
      setErr('')
    } catch (e) {
      setErr(e.message)
    }
  }, [visitId])
  useEffect(() => {
    if (open && visitId) load()
  }, [open, visitId, load])

  async function act(fn, ok) {
    try {
      const r = await fn()
      await load()
      syncQueue()
      if (ok) showToast(translate(ok))
      return r
    } catch (e) {
      showToast(e.message, 'error')
      return null
    }
  }

  if (!open || !patient) return null
  const items = rx?.items ?? []
  const waiting = items.filter((l) => l.dispense_status === 'Pending')
  const paid = inv?.payment_status === 'Paid'
  const editable = inv?.payment_status === 'Pending'
  const ticket = patient.ticket ? String(patient.ticket).padStart(3, '0') : ''

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Dispensing & payment') + ' · ' + (ticket ? ticket + ' ' : '') + patient.name} onClose={onClose} />
      <div className="modal-b">
        {err && (
          <div className="banner d mb-12">
            <Icon name="triangle-alert" />
            <div className="txt">{err}</div>
          </div>
        )}
        {inv === undefined && !err ? (
          <Skeleton rows={3} />
        ) : (
          <>
            <div className="utabs" style={{ margin: '-18px -20px 0' }}>
              <button className={tab === 'dispense' ? 'on' : ''} onClick={() => setTab('dispense')}>
                {translate('Dispensing')}
                {waiting.length > 0 && (
                  <span className="badge b-warning ml-8">
                    {waiting.length}
                  </span>
                )}
              </button>
              <button className={tab === 'pay' ? 'on' : ''} onClick={() => setTab('pay')}>
                {translate('Invoice & payment')}
                {!paid && inv && (
                  <span className="badge b-warning ml-8">
                    {translate('Awaiting payment')}
                  </span>
                )}
              </button>
            </div>

            <div className="pt-14">
              {/* Hai tab luôn được dựng, chỉ ẩn tab không chọn: đổi tab không mất phần đang nhập dở (phí khám, dịch vụ, lý do bỏ qua…). */}
              <DispenseTab active={tab === 'dispense'} visitId={visitId} items={items} waiting={waiting} paid={paid} rx={rx} patient={patient} ticket={ticket} user={user} act={act} />

              {tab === 'pay' && !inv && <p className="muted small">{translate('No invoice for this visit.')}</p>}
              {inv && (
                <div className={'panel' + (tab === 'pay' ? ' on' : '')}>
                  <InvoiceItems visitId={visitId} inv={inv} editable={editable} cat={cat} orders={orders} act={act} onCancelLine={setCancelLine} />
                  <PaymentSummary visitId={visitId} inv={inv} paid={paid} editable={editable} items={items} patient={patient} user={user} act={act} onClose={onClose} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="modal-f">
        <span className="sp" />
        <button className="btn btn-outline" onClick={onClose}>
          {translate('Close')}
        </button>
      </div>
      {cancelLine && (
        <CancelOrderItemModal
          item={cancelLine}
          onClose={() => setCancelLine(null)}
          onDone={async () => {
            setCancelLine(null)
            await load()
            syncQueue()
            showToast(translate('Order cancelled — the invoice was re-issued'))
          }}
        />
      )}
    </Modal>
  )
}
