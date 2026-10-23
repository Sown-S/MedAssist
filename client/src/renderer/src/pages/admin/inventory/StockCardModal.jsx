import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { reasonLabel, loadMovesFor } from '../../../api/inventoryStore'
import { MOVE_TYPES, fmtDateTime, unitLabel, exportCsv } from './shared'

// Thẻ kho: toàn bộ lịch sử nhập / xuất / điều chỉnh / huỷ của 1 thuốc, kèm người thao tác và tồn sau phiếu.
// Backend thật: nạp phiếu của các lô thuốc này khi mở (loadMovesFor) — bản giả lập đã có sẵn trong moves.
export default function StockCardModal({ drug, moves, onClose }) {
  const [type, setType] = useState('all')
  useEffect(() => {
    if (drug) loadMovesFor(drug.id).catch(() => {})
  }, [drug])
  if (!drug) return null
  const list = moves.filter((m) => m.drugId === drug.id && (type === 'all' || m.type === type))
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Stock card') + ' · ' + drug.name} onClose={onClose} />
      <div className="modal-body">
        <div className="ai-toolbar">
          <div className="ai-seg">
            <button className={type === 'all' ? 'active' : ''} onClick={() => setType('all')}>
              All
            </button>
            {Object.entries(MOVE_TYPES).map(([k, v]) => (
              <button key={k} className={type === k ? 'active' : ''} onClick={() => setType(k)}>
                {v}
              </button>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              exportCsv(
                `stock-card-${drug.id}.csv`,
                ['Time', 'Voucher no.', 'Type', 'Lot', 'Quantity', 'Balance', 'By', 'Note'],
                list.map((m) => [fmtDateTime(m.at), m.ref, translate(MOVE_TYPES[m.type]), m.lot, m.qty, m.balance, m.by, [m.reason && translate(reasonLabel(m.reason)), m.note && translate(m.note)].filter(Boolean).join(' — ')])
              )
            }
          >
            <Icon name="download" /> <span>Export to Excel (CSV)</span>
          </button>
        </div>
        <div className="ai-table-wrap" style={{ maxHeight: 420 }}>
          <table className="dt">
            <thead>
              <tr>
                <th>Time</th>
                <th>Voucher no.</th>
                <th>Type</th>
                <th>Lot</th>
                <th className="num">Quantity</th>
                <th className="num">Balance</th>
                <th>By</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{fmtDateTime(m.at)}</td>
                  <td className="mono">{m.ref}</td>
                  <td>
                    <span className={'badge ' + (m.type === 'in' ? 'ok' : m.type === 'out' ? 'info' : 'warn')}>{MOVE_TYPES[m.type]}</span>
                  </td>
                  <td className="mono">{m.lot}</td>
                  <td className={'mono num ' + (m.qty > 0 ? 'inv-plus' : 'inv-minus')}>
                    {m.qty > 0 ? '+' : ''}
                    {m.qty}
                  </td>
                  <td className="mono num">{m.balance}</td>
                  <td>{m.by}</td>
                  <td className="ai-soft ai-small">
                    {m.reason && <span>{reasonLabel(m.reason)}</span>}
                    {m.reason && m.note && ' — '}
                    {m.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ai-hint">
          <span>Quantities in</span> <b>{unitLabel(drug.unit)}</b>
        </p>
      </div>
    </Modal>
  )
}
