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
      <ModalHeader title={translate('Dispensing & payment') + ' — ' + (ticket ? ticket + ' ' : '') + patient.name} onClose={onClose} />
      {err && <div className="warn-banner danger show" style={{ margin: 12 }}>{err}</div>}
      {inv === undefined && !err ? (
        <p className="ai-soft" style={{ padding: 16 }}>Loading…</p>
      ) : (
        <>
          <div className="pay-status-line">
            <span className={'badge ' + (paid ? 'ok' : 'warn')}>{translate(paid ? 'Paid' : 'Awaiting payment')}</span>
            <span className={'badge ' + (waiting.length ? 'warn' : 'ok')}>{waiting.length ? waiting.length + ' ' + translate('drugs to dispense') : translate('Dispensing done')}</span>
          </div>
          <div className="itabs">
            <button className={'itab' + (tab === 'dispense' ? ' active' : '')} onClick={() => setTab('dispense')}>
              <Icon name="box" /> <span>Dispensing</span> {waiting.length > 0 && <span className="itab-cnt">{waiting.length}</span>}
            </button>
            <button className={'itab' + (tab === 'pay' ? ' active' : '')} onClick={() => setTab('pay')}>
              <Icon name="banknote" /> <span>Invoice &amp; payment</span>
            </button>
          </div>

          {/* Hai tab luôn được dựng, chỉ ẩn tab không chọn: đổi tab không mất phần đang nhập dở (phí khám, dịch vụ, lý do bỏ qua…). */}
          <DispenseTab active={tab === 'dispense'} visitId={visitId} items={items} waiting={waiting} paid={paid} rx={rx} patient={patient} ticket={ticket} user={user} act={act} />

          {tab === 'pay' && !inv && <p className="ai-soft" style={{ padding: 16 }}>No invoice for this visit.</p>}
          {inv && (
            <div className={'ipanel' + (tab === 'pay' ? ' active' : '')}>
              <div className="pay-cols">
                <InvoiceItems visitId={visitId} inv={inv} editable={editable} cat={cat} orders={orders} act={act} onCancelLine={setCancelLine} />

                <PaymentSummary visitId={visitId} inv={inv} paid={paid} editable={editable} items={items} patient={patient} user={user} act={act} onClose={onClose} />
              </div>
            </div>
          )}
        </>
      )}
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
