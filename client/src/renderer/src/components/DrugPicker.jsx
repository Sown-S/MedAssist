import { useState } from 'react'
import { useInventory, stockOf } from '../api/inventoryStore'
import { unitLabel } from '../pages/admin/inventory/shared'

// Ô tìm thuốc trong Danh mục (tên, hoạt chất, ATC) — hiện tồn dùng được của từng thuốc.
// Dùng khi lễ tân nhập thuốc theo đơn giấy của bác sĩ. onPick(drug) khi chọn một thuốc.
// drugs: danh mục thuốc từ server (backend thật, kèm d.stock) — bỏ trống thì dùng kho giả lập.
// inputId / title: để trang cha gắn phím tắt nhảy tới ô tìm (VD Alt+T ở màn khám).
export default function DrugPicker({ onPick, disabled, drugs, inputId, title }) {
  const inv = useInventory()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const needle = q.trim().toLowerCase()
  const matches = needle
    ? (drugs ?? inv.drugs).filter((d) => d.active && [d.name, d.ingredient, d.atc].some((x) => (x ?? '').toLowerCase().includes(needle))).slice(0, 8)
    : []

  function pick(d) {
    onPick(d)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="rx-search" style={{ position: 'relative' }}>
      <input
        type="text"
        id={inputId}
        title={title}
        placeholder="Search the drug catalog (name, active ingredient, ATC)..."
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches.length) {
            e.preventDefault()
            pick(matches[0])
          }
        }}
      />
      {open && needle && (
        <div className="icd-list show rx-drop">
          {matches.map((d) => {
            const st = d.stock ?? stockOf(d, inv.batches)
            return (
              <div className="icd-opt" key={d.id} onMouseDown={() => pick(d)}>
                <b>{d.name}</b> <span className="mono">{d.price.toLocaleString('vi-VN')}đ</span>{' '}
                {st.usable > 0 ? (
                  <span className="badge ok">
                    <span className="mono">{st.usable}</span> <span>{unitLabel(d.unit)}</span>
                  </span>
                ) : st.expired > 0 ? (
                  <span className="badge low">Only expired batches</span>
                ) : (
                  <span className="badge low">Out of stock</span>
                )}
              </div>
            )
          })}
          {!matches.length && <div className="icd-opt ai-soft">No drug in the catalog matches.</div>}
        </div>
      )}
    </div>
  )
}
