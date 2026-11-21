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
      <div className="sec-t mt-0">
        Services
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th className="r">Unit price</th>
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {consultLine?.item_name ?? translate('Consultation fee')} <span className="badge b-info">{translate('Consultation')}</span>
                {editable && consultServices.length > 1 && (
                  <select className="input mt-6 h-36" value="" onChange={(e) => changeConsult(e.target.value)}>
                    <option value="">{translate('Change consultation service…')}</option>
                    {consultServices.map((s) => (
                      <option key={s.service_id} value={s.service_id}>
                        {s.name} — {fmt(s.price)}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="r num">
                {editable ? <input className="input num w-120 h-34 text-right" type="number" min="0" step="1000" value={fee} onChange={(e) => setFee(e.target.value)} aria-label={translate('Consultation fee')} /> : fmt(inv.consultation_fee)}
              </td>
              <td>
                <div className="acts">
                  {editable && Number(fee) !== Number(inv.consultation_fee) && (
                    <button className="btn btn-outline btn-sm" onClick={saveFee}>
                      {translate('Save')}
                    </button>
                  )}
                </div>
              </td>
            </tr>
            {ordered.map((x) => {
              const it = orderItemOf(x)
              return (
                <tr key={x.invoice_item_id}>
                  <td>
                    {x.item_name}
                    {x.quantity > 1 && <span className="muted small"> × {x.quantity}</span>} <span className="badge b-info">{translate('Ordered by the doctor')}</span>
                  </td>
                  <td className="r num">{fmt(x.subtotal)}</td>
                  <td>
                    <div className="acts">
                      {editable && it && !it.result && (
                        <button className="btn btn-ghost btn-sm" title={translate('The patient did not have this done — remove it from the invoice')} onClick={() => setCancelLine({ itemId: it.item_id, name: it.item_name })}>
                          {translate('Cancel order')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {services.map((x, idx) => (
              <tr key={x.invoice_item_id}>
                <td>
                  {x.item_name}
                  {x.quantity > 1 && <span className="muted small"> × {x.quantity}</span>} <span className="badge b-neutral">{translate('Paraclinical')}</span>
                </td>
                <td className="r num">{fmt(x.subtotal)}</td>
                <td>
                  <div className="acts">
                    {editable && (
                      <button className="btn btn-ghost btn-icon" title={translate('Remove')} aria-label={translate('Remove')} onClick={() => removeService(idx)}>
                        <Icon name="x" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unbilled.length > 0 && (
        <div className="banner w mt-10">
          <Icon name="triangle-alert" />
          <div className="txt">
            <b>{translate('Ordered outside the catalog — no price yet')}</b>
            {unbilled.map((u) => (
              <button key={u.item_id} className="btn btn-ghost btn-sm" disabled={!editable} onClick={() => setCustom({ name: u.item_name, amount: '' })} title={translate('Add it below with its price')}>
                + {u.item_name}
              </button>
            ))}
          </div>
        </div>
      )}
      {editable && (
        <div className="toolbar mt-10">
          <select className="input" style={{ flex: '1 1 260px', height: 40 }} value={adding} onChange={(e) => addFromCatalog(e.target.value)}>
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
          <input className="input" style={{ flex: '1 1 220px', height: 40 }} type="text" placeholder={translate('Other service, e.g. ultrasound at partner clinic')} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          <input className="input num w-120 h-40" type="number" min="0" step="1000" placeholder={translate('Amount')} value={custom.amount} onChange={(e) => setCustom({ ...custom, amount: e.target.value })} />
          <button className="btn btn-outline btn-sm" onClick={addCustom}>
            <Icon name="plus" />
            {translate('Add')}
          </button>
        </div>
      )}

      <div className="sec-t">Medication (from the doctor’s prescription)</div>
      {drugItems.length ? (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Drug</th>
                <th className="r">Qty</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {drugItems.map((x) => (
                <tr key={x.invoice_item_id}>
                  <td>{x.item_name}</td>
                  <td className="r num">
                    {x.quantity} <span className="muted small">× {fmt(x.unit_price)}</span>
                  </td>
                  <td className="r num">{fmt(x.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">{translate('No medication on this invoice.')}</p>
      )}
    </div>
  )
}
