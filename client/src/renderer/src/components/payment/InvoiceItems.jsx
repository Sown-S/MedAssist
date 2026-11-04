import { useEffect, useState } from 'react'
import Icon from '../Icon'
import { useToast } from '../../context/ToastContext'
import { editInvoice } from '../../api/billingApi'
import { translate } from '../../i18n'
import { fmt } from './shared'

// Cột trái tab "Hoá đơn & thanh toán": phí khám (đổi dịch vụ khám / sửa phí), dòng từ phiếu chỉ định (huỷ chỉ định),
// chỉ định ngoài danh mục chưa có giá, dịch vụ quầy thêm tay, thuốc theo đơn.
export default function InvoiceItems({ visitId, inv, editable, cat, orders, act, onCancelLine }) {
  const { showToast } = useToast()
  const [adding, setAdding] = useState('')
  const [custom, setCustom] = useState({ name: '', amount: '' })
  const [fee, setFee] = useState(() => (inv ? String(Number(inv.consultation_fee)) : ''))
  // Phí khám trên ô nhập lấy lại từ hoá đơn mỗi lần tải lại.
  useEffect(() => {
    setFee(inv ? String(Number(inv.consultation_fee)) : '')
  }, [inv])
  const paraclinical = (inv?.items ?? []).filter((x) => x.item_type === 'Paraclinical')
  const services = paraclinical.filter((x) => !x.service_order_id)
  const ordered = paraclinical.filter((x) => x.service_order_id)
  const consultLine = (inv?.items ?? []).find((x) => x.item_type === 'Consultation')
  // Server đã bỏ những mục quầy thêm tay cùng tên.
  const unbilled = inv?.unbilled_items ?? []
  const consultServices = cat.services.filter((s) => s.kind === 'Service' && s.group_key === 'consult' && s.is_active !== false)
  // Dòng hoá đơn → dòng chỉ định tương ứng (để huỷ). Dòng gói không huỷ riêng ở quầy.
  const orderItemOf = (x) =>
    orders
      .find((o) => o.order_id === x.service_order_id)
      ?.items.find((it) => it.status === 'Ordered' && !it.in_package && it.item_name === x.item_name)
  const drugItems = (inv?.items ?? []).filter((x) => x.item_type === 'Drug')

  // Gửi lại toàn bộ dòng nhập tay; dòng từ chỉ định server tự giữ.
  const asLine = (x) => ({ item_name: x.item_name, quantity: x.quantity, unit_price: Number(x.unit_price) })
  const saveServices = (next) => act(() => editInvoice(visitId, { paraclinical_items: next }), 'Invoice updated')
  function addFromCatalog(id) {
    setAdding('')
    const row = cat.services.find((x) => x.service_id === id)
    if (row) saveServices([...services.map(asLine), { item_name: row.name, quantity: 1, unit_price: Number(row.price) || 0 }])
  }
  const changeConsult = (id) => id && act(() => editInvoice(visitId, { consultation_service_id: id }), 'Invoice updated')
  function addCustom() {
    if (!custom.name.trim() || custom.amount === '' || !(Number(custom.amount) >= 0)) return showToast(translate('Each service line needs a name and an amount.'))
    saveServices([...services.map(asLine), { item_name: custom.name.trim(), quantity: 1, unit_price: Number(custom.amount) }])
    setCustom({ name: '', amount: '' })
  }
  const removeService = (idx) => saveServices(services.filter((_, j) => j !== idx).map(asLine))
  const saveFee = () => (Number(fee) >= 0 && fee !== '' ? act(() => editInvoice(visitId, { consultation_fee: Number(fee) }), 'Invoice updated') : showToast(translate('Enter an amount'), 'error'))
  const setCancelLine = onCancelLine

  return (
    <div>
      <div className="section-label">Services</div>
      <div className="invoice-row">
        <span className="badge info">{translate('Consultation')}</span>
        <div className="inv-name">
          {consultLine?.item_name ?? translate('Consultation fee')}
          {editable && consultServices.length > 1 && (
            <select className="ai-select" value="" onChange={(e) => changeConsult(e.target.value)} style={{ marginTop: 4 }}>
              <option value="">{translate('Change consultation service…')}</option>
              {consultServices.map((s) => (
                <option key={s.service_id} value={s.service_id}>
                  {s.name} — {fmt(s.price)}
                </option>
              ))}
            </select>
          )}
        </div>
        {editable ? (
          <span className="svc-fee">
            <input type="number" min="0" step="1000" value={fee} onChange={(e) => setFee(e.target.value)} />
            {Number(fee) !== Number(inv.consultation_fee) && (
              <button className="btn btn-ghost btn-sm" onClick={saveFee}>
                Save
              </button>
            )}
          </span>
        ) : (
          <div className="inv-price">{fmt(inv.consultation_fee)}</div>
        )}
      </div>
      {ordered.map((x) => {
        const it = orderItemOf(x)
        return (
          <div className="invoice-row" key={x.invoice_item_id}>
            <span className="badge info">{translate('Ordered by the doctor')}</span>
            <div className="inv-name">
              {x.item_name}
              {x.quantity > 1 && <div className="inv-sub">× {x.quantity}</div>}
              {editable && it && !it.result && (
                <div>
                  <button className="btn btn-ghost btn-sm inv-cancel" title={translate('The patient did not have this done — remove it from the invoice')} onClick={() => setCancelLine({ itemId: it.item_id, name: it.item_name })}>
                    Cancel order
                  </button>
                </div>
              )}
            </div>
            <div className="inv-price">{fmt(x.subtotal)}</div>
          </div>
        )
      })}
      {unbilled.length > 0 && (
        <div className="warn-banner show" style={{ margin: '6px 0' }}>
          <b>{translate('Ordered outside the catalog — no price yet')}:</b>{' '}
          {unbilled.map((u) => (
            <button key={u.item_id} className="btn btn-ghost btn-sm" disabled={!editable} onClick={() => setCustom({ name: u.item_name, amount: '' })} title={translate('Add it below with its price')}>
              + {u.item_name}
            </button>
          ))}
        </div>
      )}
      {services.map((x, idx) => (
        <div className="invoice-row" key={x.invoice_item_id}>
          <span className="badge muted">{translate('Paraclinical')}</span>
          <div className="inv-name">
            {x.item_name}
            {x.quantity > 1 && <div className="inv-sub">× {x.quantity}</div>}
          </div>
          <div className="inv-price">{fmt(x.subtotal)}</div>
          {editable && (
            <button className="icon-btn sm danger" title={translate('Remove')} onClick={() => removeService(idx)}>
              <Icon name="x" />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <div className="svc-add">
          <select className="ai-select" value={adding} onChange={(e) => addFromCatalog(e.target.value)}>
            <option value="">{translate('+ Add a service from the catalog…')}</option>
            <optgroup label={translate('Services')}>
              {cat.services
                .filter((x) => x.kind === 'Service' && x.is_active !== false && x.group_key !== 'consult')
                .map((x) => (
                  <option key={x.service_id} value={x.service_id}>
                    {x.name} — {fmt(x.price)}
                  </option>
                ))}
            </optgroup>
            <optgroup label={translate('Lab tests')}>
              {cat.services
                .filter((x) => x.kind === 'Lab' && x.is_active !== false && Number(x.price) > 0)
                .map((x) => (
                  <option key={x.service_id} value={x.service_id}>
                    {x.name} — {fmt(x.price)}
                  </option>
                ))}
            </optgroup>
          </select>
          <div className="svc-custom">
            <input type="text" placeholder={translate('Other service, e.g. ultrasound at partner clinic')} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            <input type="number" min="0" step="1000" placeholder={translate('Amount')} value={custom.amount} onChange={(e) => setCustom({ ...custom, amount: e.target.value })} />
            <button className="btn btn-ghost btn-sm" onClick={addCustom}>
              + {translate('Add')}
            </button>
          </div>
        </div>
      )}

      <div className="section-label">Medication (from the doctor’s prescription)</div>
      {drugItems.map((x) => (
        <div className="invoice-row" key={x.invoice_item_id}>
          <div className="inv-name">
            {x.item_name}
            <div className="inv-sub">
              {x.quantity} × {fmt(x.unit_price)}
            </div>
          </div>
          <div className="inv-price">{fmt(x.subtotal)}</div>
        </div>
      ))}
      {!drugItems.length && <p className="ai-soft" style={{ fontSize: 13 }}>No medication on this invoice.</p>}
    </div>
  )
}
