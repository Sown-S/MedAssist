import { useEffect, useState } from 'react'
import Modal, { ModalHeader, ModalCloseFooter } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { reasonLabel, loadMovesFor } from '../../../api/inventoryStore'
import { MOVE_TYPES, unitLabel, exportCsv } from './shared'
import { fmtDateTime } from '../../../utils/format'

// Phiếu kho nạp từ server khi mở (loadMovesFor).
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
      <div className="modal-b">
        <div className="toolbar">
          <div className="seg">
            <button className={type === 'all' ? 'on' : ''} onClick={() => setType('all')}>
              All
            </button>
            {Object.entries(MOVE_TYPES).map(([k, v]) => (
              <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>
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
        <div className="tbl-wrap" tabIndex={0} style={{ maxHeight: 420 }}>
          <div className="tbl-wrap" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Voucher no.</th>
                  <th>Type</th>
                  <th>Lot</th>
                  <th className="r num">Quantity</th>
                  <th className="r num">Balance</th>
                  <th>By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id}>
                    <td className="num">{fmtDateTime(m.at)}</td>
                    <td className="num">{m.ref}</td>
                    <td>
                      <span className={'badge ' + (m.type === 'in' ? 'b-success' : m.type === 'out' ? 'b-info' : 'b-warning')}>{MOVE_TYPES[m.type]}</span>
                    </td>
                    <td className="num">{m.lot}</td>
                    <td className={'mono num ' + (m.qty > 0 ? 'inv-plus' : 'inv-minus')}>
                      {m.qty > 0 ? '+' : ''}
                      {m.qty}
                    </td>
                    <td className="num num">{m.balance}</td>
                    <td>{m.by}</td>
                    <td className="muted small">
                      {m.reason && <span>{reasonLabel(m.reason)}</span>}
                      {m.reason && m.note && ' — '}
                      {m.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="hint">
          <span>Quantities in</span> <b>{unitLabel(drug.unit)}</b>
        </p>
      </div>
      <ModalCloseFooter onClose={onClose} />
    </Modal>
  )
}
