import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import { translate } from '../../../i18n'
import { useToast } from '../../../context/ToastContext'
import { saveDrugLive } from '../../../api/inventoryStore'
import { getSettings } from '../../../api/settingsStore'

// Thêm / sửa thuốc khi chạy với server. Thuốc trùng (hoạt chất + tên + hàm lượng + dạng) server từ chối.
// Không có giới hạn liều hay tương tác (ngoài phạm vi FR03).
const BLANK = { generic_name: '', trade_name: '', strength: '', dosage_form: '', unit: '', sale_price: '', reorder_level: '', drug_class: '', active_ingredient_code: '' }

export default function DrugFormLive({ drug, onClose }) {
  const { showToast } = useToast()
  const [f, setF] = useState(BLANK)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!drug) return
    setErr('')
    setF(
      drug.id
        ? {
            generic_name: drug.ingredient ?? '',
            trade_name: drug.tradeName ?? '',
            strength: drug.strength ?? '',
            dosage_form: drug.form ?? '',
            unit: drug.unit ?? '',
            sale_price: String(drug.price ?? ''),
            reorder_level: String(drug.threshold ?? ''),
            drug_class: drug.drugClass ?? '',
            active_ingredient_code: drug.atc ?? ''
          }
        : { ...BLANK, reorder_level: String(getSettings().ops.defaultThreshold ?? 0) }
    )
  }, [drug])
  if (!drug) return null
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const price = Number(String(f.sale_price).replace(/[.\s]/g, '').replace(',', '.'))
  const level = Number(f.reorder_level || 0)

  async function save() {
    for (const k of ['generic_name', 'trade_name', 'strength', 'dosage_form', 'unit']) if (!f[k].trim()) return setErr(translate('Fill in every field marked *'))
    if (!(price >= 0) || f.sale_price === '') return setErr(translate('Enter the selling price.'))
    if (!(Number.isInteger(level) && level >= 0)) return setErr(translate('Enter the minimum stock threshold.'))
    const opt = (s) => (s.trim() ? s.trim() : null)
    setBusy(true)
    const r = await saveDrugLive(drug.id, {
      generic_name: f.generic_name.trim(),
      trade_name: f.trade_name.trim(),
      strength: f.strength.trim(),
      dosage_form: f.dosage_form.trim(),
      unit: f.unit.trim(),
      sale_price: price,
      reorder_level: level,
      drug_class: opt(f.drug_class),
      active_ingredient_code: opt(f.active_ingredient_code)
    })
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    showToast(drug.id ? 'Drug information saved' : 'Drug added to the catalog')
    onClose()
  }

  const field = (k, label, req, props = {}) => (
    <div className="field">
      <label>
        {label} {req && <span className="ai-req">*</span>}
      </label>
      <input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  )
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={drug.id ? translate('Edit drug information') + ' · ' + drug.name : 'Add drug'} onClose={onClose} />
      <div className="modal-body">
        <div className="form-grid cols-2">
          {field('generic_name', 'Active ingredient', true, { placeholder: 'Paracetamol' })}
          {field('trade_name', 'Trade name', true, { placeholder: 'Panadol' })}
          {field('strength', 'Strength', true, { placeholder: '500 mg' })}
          {field('dosage_form', 'Dosage form', true, { placeholder: 'viên nén' })}
          {field('unit', 'Smallest unit sold', true, { placeholder: 'viên' })}
          {field('sale_price', 'Selling price (per unit)', true, { inputMode: 'numeric' })}
          {field('reorder_level', 'Minimum stock threshold', false, { inputMode: 'numeric' })}
          {field('drug_class', 'Drug group (optional)', false)}
          {field('active_ingredient_code', 'ATC code (optional)', false, { placeholder: 'N02BE01' })}
        </div>
        <p className="ai-foot-note">The batch purchase price is entered when receiving stock. The system does not check drug interactions or dose limits.</p>
        {err && <div className="kb-error">{err}</div>}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          {drug.id ? 'Save' : 'Add drug'}
        </button>
      </div>
    </Modal>
  )
}
