import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { useToast } from '../../../context/ToastContext'
import { upsertDrug, isRxOnly } from '../../../api/inventoryStore'
import { UNITS, fmtMoney } from './shared'
import { getSettings } from '../../../api/settingsStore'

const BLANK = { name: '', ingredient: '', atc: '', unit: 'tablet', kind: 'drug', group: 'regular', essential: false, cost: '', price: '', threshold: '', strengthMg: '', maxMgDay: '', maxMgKgDay: '', controlledType: 'H' }
const optNum = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))

// Dữ liệu GỐC của thuốc (danh mục). Tồn kho theo lô KHÔNG sửa ở đây — dùng Nhập kho / Kiểm kho.
export default function DrugFormModal({ drug, drugs, user, onClose }) {
  const { showToast } = useToast()
  const [f, setF] = useState(BLANK)
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (drug) {
      const s = (v) => (v == null ? '' : String(v))
      setF(
        drug.id
          ? { ...BLANK, ...drug, rxOnly: isRxOnly(drug), cost: String(drug.cost), price: String(drug.price), threshold: String(drug.threshold), strengthMg: s(drug.strengthMg), maxMgDay: s(drug.maxMgDay), maxMgKgDay: s(drug.maxMgKgDay), controlledType: drug.controlledType ?? 'H' }
          : { ...BLANK, threshold: String(getSettings().ops.defaultThreshold) }
      ) // thuốc mới: ngưỡng mặc định ở Cài đặt › Vận hành
      setTried(false)
    }
  }, [drug])
  if (!drug) return null

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const num = (s) => (String(s).trim() === '' ? NaN : Number(String(s).replace(/[.\s]/g, '').replace(',', '.')))
  const cost = num(f.cost)
  const price = num(f.price)
  const threshold = num(f.threshold)
  const errors = []
  if (!f.name.trim()) errors.push('Enter the drug name.')
  if (drugs.some((d) => d.id !== drug.id && d.name.trim().toLowerCase() === f.name.trim().toLowerCase())) errors.push('A drug with this name already exists.')
  if (f.kind === 'drug' && !f.ingredient.trim()) errors.push('Enter the active ingredient.')
  if (f.kind === 'drug' && !/^[A-Z]\d{2}[A-Z]{0,2}\d{0,2}$/.test(f.atc.trim())) errors.push('Enter a valid ATC code (e.g. J01CA04) — the interaction check depends on it.')
  if (!(cost >= 0)) errors.push('Enter the purchase price.')
  if (!(price >= 0)) errors.push('Enter the selling price.')
  if (cost >= 0 && price >= 0 && price < cost) errors.push('Selling price is lower than purchase price.')
  if (!(threshold >= 0)) errors.push('Enter the minimum stock threshold.')
  for (const k of ['strengthMg', 'maxMgDay', 'maxMgKgDay']) if (optNum(f[k]) != null && !(optNum(f[k]) > 0)) errors.push('Dosing limits must be positive numbers (leave empty if unknown).')

  function save() {
    setTried(true)
    if (errors.length) return
    upsertDrug(
      {
        ...f,
        id: drug.id,
        name: f.name.trim(),
        ingredient: f.ingredient.trim(),
        atc: f.atc.trim().toUpperCase(),
        cost,
        price,
        threshold,
        strengthMg: optNum(f.strengthMg),
        maxMgDay: optNum(f.maxMgDay),
        maxMgKgDay: optNum(f.maxMgKgDay),
        controlledType: f.group === 'controlled' ? f.controlledType : null
      },
      user
    )
    showToast(drug.id ? 'Drug information saved' : 'Drug added to the catalog')
    onClose()
  }

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={drug.id ? translate('Edit drug information') + ' · ' + drug.name : 'Add drug'} onClose={onClose} />
      <div className="modal-body">
        <div className="ai-seg" style={{ marginBottom: 12 }}>
          <button className={f.kind === 'drug' ? 'active' : ''} onClick={() => set('kind', 'drug')}>
            Medicine
          </button>
          <button className={f.kind === 'supply' ? 'active' : ''} onClick={() => set('kind', 'supply')}>
            Medical supply
          </button>
        </div>
        <div className="ai-grid3">
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>
              Name &amp; strength <span className="ai-req">*</span>
            </label>
            <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Amoxicillin 500mg" />
          </div>
          <div className="field">
            <label>Unit</label>
            <select value={f.unit} onChange={(e) => set('unit', e.target.value)}>
              {UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          {f.kind === 'drug' && (
            <>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>
                  Active ingredient <span className="ai-req">*</span>
                </label>
                <input value={f.ingredient} onChange={(e) => set('ingredient', e.target.value)} />
              </div>
              <div className="field">
                <label>
                  ATC code <span className="ai-req">*</span>
                </label>
                <input value={f.atc} onChange={(e) => set('atc', e.target.value.toUpperCase())} placeholder="J01CA04" />
              </div>
            </>
          )}
          <div className="field">
            <label>Purchase price (per unit)</label>
            <input inputMode="numeric" value={f.cost} onChange={(e) => set('cost', e.target.value)} />
          </div>
          <div className="field">
            <label>Selling price (per unit)</label>
            <input inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value)} />
          </div>
          <div className="field">
            <label>Minimum stock threshold</label>
            <input inputMode="numeric" value={f.threshold} onChange={(e) => set('threshold', e.target.value)} />
          </div>
        </div>
        {f.kind === 'drug' && (
          <>
            <div className="section-label">Dosing limits — used to check doses when prescribing</div>
            <div className="ai-grid3">
              <div className="field">
                <label>Strength (mg per unit)</label>
                <input inputMode="decimal" value={f.strengthMg} onChange={(e) => set('strengthMg', e.target.value)} placeholder="e.g. 500" />
              </div>
              <div className="field">
                <label>Max daily dose — adult (mg/day)</label>
                <input inputMode="decimal" value={f.maxMgDay} onChange={(e) => set('maxMgDay', e.target.value)} placeholder="e.g. 4000" />
              </div>
              <div className="field">
                <label>Max daily dose — child (mg/kg/day)</label>
                <input inputMode="decimal" value={f.maxMgKgDay} onChange={(e) => set('maxMgKgDay', e.target.value)} placeholder="e.g. 60" />
              </div>
            </div>
            <p className="ai-hint">
              <span>Check the National Drug Formulary / package insert. Leave empty if unknown — the dose is then not checked.</span>
            </p>
          </>
        )}
        {cost >= 0 && price > 0 && (
          <p className="ai-hint">
            <span>Margin</span> <span className="mono">{fmtMoney(price - cost)}</span>{' '}
            <span className="mono">({Math.round(((price - cost) / price) * 100)}%)</span> ·{' '}
            <span>Invoices use this selling price automatically.</span>
          </p>
        )}
        <div className="inv-flags">
          <label className="ai-check">
            <input type="checkbox" checked={f.essential} onChange={(e) => set('essential', e.target.checked)} />
            <span>
              <b>Essential medication</b> — <span>reception is warned if it is removed from an invoice</span>
            </span>
          </label>
          <label className="ai-check">
            <input type="checkbox" checked={f.group === 'controlled'} onChange={(e) => set('group', e.target.checked ? 'controlled' : 'regular')} />
            <span>
              <b>Specially controlled drug</b> — <span>tracked in a separate in/out ledger</span>
            </span>
          </label>
          {f.group === 'controlled' && f.kind === 'drug' && (
            <div className="field" style={{ marginLeft: 26, maxWidth: 320 }}>
              <label>Prescription type</label>
              <select value={f.controlledType} onChange={(e) => set('controlledType', e.target.value)}>
                <option value="N">Narcotic (prescription “N”)</option>
                <option value="H">Psychotropic (prescription “H”)</option>
              </select>
            </div>
          )}
          {f.kind === 'drug' && (
            <label className="ai-check">
              <input type="checkbox" checked={f.rxOnly ?? isRxOnly(f)} onChange={(e) => set('rxOnly', e.target.checked)} />
              <span>
                <b>Prescription-only drug</b> — <span>reception must record who prescribed it when selling over the counter</span>
              </span>
            </label>
          )}
        </div>
        {tried && errors.length > 0 && (
          <div className="warn-banner show danger">
            <div className="icon">
              <Icon name="ban" />
            </div>
            <div className="txt">
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save}>
          <Icon name="save" /> <span>Save</span>
        </button>
      </div>
    </Modal>
  )
}
