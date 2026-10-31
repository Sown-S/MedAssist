import { useEffect, useState } from 'react'
import Icon from '../../../components/Icon'
import Modal, { ModalHeader } from '../../../components/Modal'
import { translate } from '../../../i18n'
import { useToast } from '../../../context/ToastContext'
import { upsertRow } from '../../../api/catalogStore'
import { todayISO } from '../../../api/inventoryStore'
import { fmtMoney, fmtDate, fmtDateTime } from '../inventory/shared'
import { SCHEMAS, resolveRef, packageTotal } from './schemas'
import { saveLiveRow, livePriceHistory } from '../../../api/serviceCatalogLive'

// ---------- Form thêm / sửa ----------
export function RowForm({ catalogKey, live, row, all, cats, inv, user, onClose }) {
  const s = SCHEMAS[catalogKey]
  const { showToast } = useToast()
  const isNew = !row.id
  const [saving, setSaving] = useState(false)
  // Backend thật: lịch sử giá đọc từ nhật ký server (GET /admin/services/{id}/price-history), mới nhất trước.
  const [prices, setPrices] = useState(null)
  useEffect(() => {
    if (live && !isNew && catalogKey !== 'packages') livePriceHistory(row.id).then(setPrices, () => setPrices([]))
  }, [live, isNew, catalogKey, row.id])
  const [f, setF] = useState(() => {
    const init = { ...row }
    for (const fd of s.fields) {
      if (init[fd.key] === undefined) init[fd.key] = fd.type === 'select' ? (fd.options[0]?.key ?? '') : ['pkgItems', 'rxItems', 'advicePick'].includes(fd.type) ? [] : ''
    }
    if (catalogKey === 'address' && isNew) init.level = 'commune'
    if (catalogKey === 'services') init.priceFrom = todayISO()
    return init
  })
  const [tried, setTried] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const priceChanged = catalogKey === 'services' && !isNew && Number(f.price) !== row.price

  const errors = []
  for (const fd of s.fields) {
    const v = f[fd.key]
    if (fd.required && (v === '' || v == null || (Array.isArray(v) && !v.length))) errors.push(translate('Required') + ': ' + translate(fd.label))
    if ((fd.type === 'money' || fd.type === 'number') && v !== '' && v != null && !(Number(v) >= 0)) errors.push(translate('Must be a number ≥ 0') + ': ' + translate(fd.label))
  }
  const code = String(f.code ?? '').trim()
  if (code && all.some((r) => r.id !== row.id && r.code.toLowerCase() === code.toLowerCase())) errors.push('This code already exists in the catalog.')
  if (code && s.codePattern && !s.codePattern.re.test(code)) errors.push(s.codePattern.msg)
  if (catalogKey === 'labs' && f.low !== '' && f.high !== '' && f.low != null && f.high != null && Number(f.low) > Number(f.high)) errors.push('Reference low is greater than reference high.')
  if (catalogKey === 'rxtemplates' && (f.items ?? []).some((it) => !it.drugId || !(it.qty > 0))) errors.push('Every drug line needs a drug and a quantity.')

  async function save() {
    setTried(true)
    if (errors.length) return
    const data = { ...f, code: s.upperCode ? code.toUpperCase() : code, name: String(f.name).trim() }
    for (const fd of s.fields) {
      if (fd.type === 'money' || fd.type === 'number') data[fd.key] = f[fd.key] === '' || f[fd.key] == null ? null : Number(f[fd.key])
      if (fd.onlyWhenPriceChanges && !priceChanged) delete data[fd.key]
    }
    if (catalogKey === 'icd' && isNew) data.custom = true
    if (live) {
      setSaving(true)
      const r = await saveLiveRow(catalogKey, { ...data, id: row.id })
      setSaving(false)
      if (!r.ok) return showToast(translate(r.error))
    } else upsertRow(catalogKey, data, user, s.title)
    showToast(isNew ? 'Record added' : 'Record saved')
    onClose()
  }

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={isNew ? translate('Add') + ' · ' + translate(s.title) : row.code + ' · ' + row.name} onClose={onClose} />
      <div className="modal-body">
        {catalogKey === 'icd' && isNew && (
          <p className="ai-hint">
            <Icon name="help" /> <span>A code added here is marked “Custom” so it can be checked against the official list later.</span>
          </p>
        )}
        <div className="ai-grid3">
          {s.fields
            // Server ghi giá mới ngay khi lưu (không có ngày hiệu lực riêng).
            .filter((fd) => !fd.onlyWhenPriceChanges || (priceChanged && !live))
            .map((fd) => (
              <div className="field" key={fd.key} style={fd.wide ? { gridColumn: '1 / -1' } : undefined}>
                <label>
                  {fd.label} {fd.required && <span className="ai-req">*</span>}
                </label>
                {live && !isNew && fd.key === 'code' ? (
                  <input value={f.code} disabled title={translate('The code cannot be changed after it is created.')} />
                ) : (
                  <FieldInput fd={fd} value={f[fd.key]} onChange={(v) => set(fd.key, v)} cats={cats} inv={inv} />
                )}
              </div>
            ))}
        </div>

        {catalogKey === 'packages' && (
          <p className="ai-hint">
            <span>Separate price</span> <b className="mono">{fmtMoney(packageTotal(f, cats))}</b> · <span>Package price</span>{' '}
            <b className="mono">{fmtMoney(Number(f.price) || 0)}</b>
            {packageTotal(f, cats) > (Number(f.price) || 0) && (
              <>
                {' · '}
                <span>Patient saves</span> <b className="mono inv-plus">{fmtMoney(packageTotal(f, cats) - (Number(f.price) || 0))}</b>
              </>
            )}
          </p>
        )}
        {live && !isNew && prices && (
          <>
            <div className="section-label">Price history</div>
            <table className="dt">
              <thead>
                <tr>
                  <th>Changed at</th>
                  <th className="num">Old price</th>
                  <th className="num">New price</th>
                  <th>Changed by</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((h, i) => (
                  <tr key={i}>
                    <td className="mono">{fmtDateTime(h.changed_at)}</td>
                    <td className="num mono">{h.old_price == null ? '—' : fmtMoney(Number(h.old_price))}</td>
                    <td className="num mono">{h.price == null ? '—' : fmtMoney(Number(h.price))}</td>
                    <td>{h.changed_by_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ai-hint">Invoices and lab orders store the price at the time they are made, so changing the price here does not change old documents.</p>
          </>
        )}
        {!live && catalogKey === 'services' && !isNew && (
          <>
            <div className="section-label">Price history</div>
            <table className="dt">
              <thead>
                <tr>
                  <th>Effective from</th>
                  <th className="num">Unit price</th>
                  <th>Changed by</th>
                </tr>
              </thead>
              <tbody>
                {[...(row.priceHistory ?? [])].reverse().map((h, i) => (
                  <tr key={i}>
                    <td className="mono">{fmtDate(h.from)}</td>
                    <td className="num mono">{fmtMoney(h.price)}</td>
                    <td>{h.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ai-hint">Invoices store the unit price at the time they are issued, so changing the price here does not change old invoices.</p>
          </>
        )}
        {!isNew && (
          <p className="ai-soft ai-small">
            <span>Last updated</span> <span className="mono">{fmtDateTime(row.updatedAt)}</span> · {row.updatedBy}
          </p>
        )}
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
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Icon name="save" /> <span>Save</span>
        </button>
      </div>
    </Modal>
  )
}

export function FieldInput({ fd, value, onChange, cats, inv }) {
  if (fd.type === 'select')
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {fd.options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    )
  if (fd.type === 'textarea') return <textarea rows={2} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  if (fd.type === 'date') return <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  if (fd.type === 'money' || fd.type === 'number')
    return <input type="number" min="0" step={fd.type === 'money' ? 1000 : 'any'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  if (fd.type === 'pkgItems') return <PackageItems value={value ?? []} onChange={onChange} cats={cats} />
  if (fd.type === 'rxItems') return <RxItems value={value ?? []} onChange={onChange} cats={cats} inv={inv} />
  if (fd.type === 'advicePick') return <AdvicePick value={value ?? []} onChange={onChange} cats={cats} />
  if (fd.type === 'icd')
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {cats.icd
          .filter((r) => r.active)
          .map((r) => (
            <option key={r.id} value={r.code}>
              {r.code + ' · ' + r.name}
            </option>
          ))}
      </select>
    )
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
}

export function PackageItems({ value, onChange, cats }) {
  const [pick, setPick] = useState('')
  const options = [
    ...cats.services.filter((r) => r.active).map((r) => ({ ref: 'service:' + r.code, r })),
    ...cats.labs.filter((r) => r.active).map((r) => ({ ref: 'lab:' + r.code, r }))
  ].filter((o) => !value.some((v) => v.ref === o.ref))
  return (
    <div className="cat-lines">
      {value.map((it, i) => {
        const r = resolveRef(it.ref, cats)
        return (
          <div className="cat-line" key={it.ref}>
            <span className="mono">{it.ref.split(':')[1]}</span>
            <span className="cat-line-name">{r?.name ?? it.ref}</span>
            <input
              type="number"
              min="1"
              className="ai-inline-input"
              value={it.qty}
              onChange={(e) => onChange(value.map((v, j) => (j === i ? { ...v, qty: Math.max(1, +e.target.value || 1) } : v)))}
            />
            <span className="mono ai-soft">{fmtMoney((r?.price ?? 0) * it.qty)}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Icon name="trash" />
            </button>
          </div>
        )
      })}
      <div className="cat-line">
        <select className="ai-select" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">— Add a service or lab test —</option>
          {options.map((o) => (
            <option key={o.ref} value={o.ref}>
              {o.r.code + ' · ' + o.r.name + ' · ' + fmtMoney(o.r.price ?? 0)}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!pick} onClick={() => (onChange([...value, { ref: pick, qty: 1 }]), setPick(''))}>
          + Add
        </button>
      </div>
    </div>
  )
}

export function RxItems({ value, onChange, cats, inv }) {
  const drugs = inv.drugs.filter((d) => d.active)
  const routes = cats.routes.filter((r) => r.active)
  const upd = (i, patch) => onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  return (
    <div className="cat-lines">
      {value.map((it, i) => (
        <div className="cat-line rx" key={i}>
          <select className="ai-select" value={it.drugId} onChange={(e) => upd(i, { drugId: e.target.value })}>
            <option value="">—</option>
            {drugs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input type="number" min="1" className="ai-inline-input" value={it.qty} onChange={(e) => upd(i, { qty: +e.target.value })} />
          <select className="ai-select" value={it.route ?? 'PO'} onChange={(e) => upd(i, { route: e.target.value })}>
            {routes.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
          <input className="ai-inline-input cat-line-name" value={it.usage ?? ''} placeholder="Directions" onChange={(e) => upd(i, { usage: e.target.value })} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...value, { drugId: '', qty: 1, route: 'PO', usage: '' }])}>
        + Add drug
      </button>
    </div>
  )
}

export function AdvicePick({ value, onChange, cats }) {
  return (
    <div className="ai-sym-picker">
      {cats.advice
        .filter((r) => r.active || value.includes(r.code))
        .map((r) => {
          const on = value.includes(r.code)
          return (
            <button key={r.code} type="button" className={'ai-sym' + (on ? ' on' : '')} onClick={() => onChange(on ? value.filter((x) => x !== r.code) : [...value, r.code])}>
              {on && <Icon name="check" />}
              <span>{r.name}</span>
            </button>
          )
        })}
    </div>
  )
}
