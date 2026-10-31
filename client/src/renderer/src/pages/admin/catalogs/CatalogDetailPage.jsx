import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon'
import Modal, { ModalHeader } from '../../../components/Modal'
import { translate } from '../../../i18n'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { useCatalogs, upsertRow, setRowActive, importRows } from '../../../api/catalogStore'
import { useInventory, todayISO } from '../../../api/inventoryStore'
import { ConfirmDialog, Empty } from '../ai/ui'
import { Pager, paginate, exportCsv, fmtMoney, fmtDate, fmtDateTime } from '../inventory/shared'
import { SCHEMAS, optLabel, resolveRef, packageTotal } from './schemas'
import { isLiveCatalog, useLiveCatalog, saveLiveRow, setLiveActive, livePriceHistory } from '../../../api/serviceCatalogLive'

// ---------- CSV ----------
function splitCsv(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && line[i + 1] === '"' && q) {
      cur += '"'
      i++
    } else if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}
const csvValue = (schema, key, v) => {
  const f = schema.fields.find((x) => x.key === key)
  if (Array.isArray(v)) return v.join('; ')
  if (f?.type === 'select') return v ?? ''
  return v ?? ''
}
export function exportCatalog(key, rows) {
  const s = SCHEMAS[key]
  exportCsv(
    `danh-muc-${key}-${todayISO()}.csv`,
    [...s.csv.map((k) => s.fields.find((f) => f.key === k)?.label ?? k), 'Status'],
    rows.map((r) => [...s.csv.map((k) => csvValue(s, k, r[k])), translate(r.active ? 'In use' : 'Discontinued')])
  )
}
// Đọc file: dòng đầu là tên cột (khoá trường, VD code,name,...). Trả về dòng hợp lệ + lỗi theo số dòng.
export function parseCatalogCsv(key, text) {
  const s = SCHEMAS[key]
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { rows: [], errors: [{ n: 0, msg: 'The file is empty.' }] }
  const head = splitCsv(lines[0]).map((h) => h.trim())
  const known = s.csv.filter((k) => head.includes(k))
  if (!head.includes('code') || !head.includes('name')) return { rows: [], errors: [{ n: 1, msg: 'The first row must contain the columns: ' + s.csv.join(', ') }] }
  const rows = []
  const errors = []
  const seen = new Set()
  lines.slice(1).forEach((line, i) => {
    const n = i + 2
    const cells = splitCsv(line)
    const r = {}
    for (const k of known) {
      let v = cells[head.indexOf(k)] ?? ''
      const f = s.fields.find((x) => x.key === k)
      if (f?.type === 'money' || f?.type === 'number') v = v === '' ? null : Number(String(v).replace(/[^\d.-]/g, ''))
      if (k === 'code' && s.upperCode) v = String(v).toUpperCase()
      r[k] = v
    }
    if (!r.code || !r.name) return errors.push({ n, msg: 'Missing code or name.' })
    if (s.codePattern && !s.codePattern.re.test(r.code)) return errors.push({ n, msg: s.codePattern.msg })
    const bad = s.fields.find((f) => f.type === 'select' && known.includes(f.key) && r[f.key] && !f.options.some((o) => o.key === r[f.key]))
    if (bad) return errors.push({ n, msg: translate('Unknown value') + ' — ' + translate(bad.label) + ': ' + r[bad.key] })
    if (seen.has(r.code.toLowerCase())) return errors.push({ n, msg: 'Duplicate code in the file.' })
    seen.add(r.code.toLowerCase())
    if (key === 'icd') r.custom = false
    rows.push(r)
  })
  return { rows, errors }
}

// ---------- Trang ----------
export default function CatalogDetailPage({ catalogKey, params, onNavigate }) {
  const s = SCHEMAS[catalogKey]
  // Backend thật: Dịch vụ, Xét nghiệm, Gói khám đọc / ghi qua server (ERD v2.1); các danh mục khác vẫn ở máy này.
  const live = isLiveCatalog(catalogKey)
  const lc = useLiveCatalog(live)
  const local = useCatalogs()
  const cats = live ? { ...local, services: lc.services, labs: lc.labs, packages: lc.packages } : local
  // Server không lưu ngày hiệu lực của giá → bỏ cột "Giá áp dụng từ" (lịch sử giá xem trong form sửa).
  const columns = live ? s.columns.filter((c) => c.key !== 'priceHistory') : s.columns
  const inv = useInventory()
  const { user } = useAuth()
  const { showToast } = useToast()
  const all = cats[catalogKey] ?? []
  const [q, setQ] = useState(params?.q ?? '')
  const [status, setStatus] = useState('active')
  const [sub, setSub] = useState('all')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(params?.openId ? all.find((r) => r.id === params.openId) ?? null : null)
  const [toggle, setToggle] = useState(null)
  const [imp, setImp] = useState(null)
  const fileRef = useRef(null)

  const term = q.trim().toLowerCase()
  const list = all
    .filter((r) => (status === 'all' ? true : status === 'active' ? r.active : !r.active))
    .filter((r) => !s.filter || sub === 'all' || r[s.filter.field] === sub)
    .filter((r) => !term || Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(term)))
    .sort((a, b) => a.code.localeCompare(b.code, 'vi', { numeric: true }))
  const pg = paginate(list, page, 15)
  const lastUpdate = all.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), '')
  const reset = (fn) => (v) => (fn(v), setPage(1))

  const onFile = (e) => readCatalogFile(e, catalogKey, all, setImp)

  return (
    <div>
      <div className="breadcrumb">
        <span className="cat-crumb" onClick={() => onNavigate('catalog')}>
          Catalog management
        </span>{' '}
        / <b>{s.title}</b>
      </div>
      <div className="page-head">
        <div>
          <h1>{s.title}</h1>
          <p>{s.desc}</p>
        </div>
        <div className="ai-soft ai-small">
          <span>Last updated</span> <span className="mono">{fmtDateTime(lastUpdate)}</span>
        </div>
      </div>

      {catalogKey === 'address' && (
        <div className="warn-banner show caution" style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="txt">
            <b>Administrative units after the 2025 reorganisation</b>
            From 01/07/2025 there are 34 province-level units and no district level. Check this list against the official resolution and import the official ward / commune list
            before using it on patient records; old addresses on existing records are kept as entered.
          </div>
        </div>
      )}
      {catalogKey === 'icd' && (
        <div className="warn-banner show caution" style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="icon">
            <Icon name="help" />
          </div>
          <div className="txt">
            <b>
              <span className="mono">{all.length}</span> <span>codes — sample list of common outpatient codes</span>
            </b>
            Import the full ICD-10 file published by the Ministry of Health (columns code, name, nameEn, chapter). Codes not in the standard list can be added by hand and are marked “Custom”.
          </div>
        </div>
      )}

      <div className="card">
        <div className="ai-toolbar">
          <div className="ai-search">
            <Icon name="search" />
            <input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search code or name…" />
          </div>
          <div className="ai-toolbar-right">
            {s.filter && (
              <select className="ai-select" value={sub} onChange={(e) => reset(setSub)(e.target.value)}>
                <option value="all">All groups</option>
                {s.filter.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <div className="ai-seg">
              {[
                ['active', 'In use'],
                ['inactive', 'Discontinued'],
                ['all', 'All']
              ].map(([k, l]) => (
                <button key={k} className={status === k ? 'active' : ''} onClick={() => reset(setStatus)(k)}>
                  {l}
                </button>
              ))}
            </div>
            {!live && (
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                <Icon name="paperclip" /> <span>Import from Excel (CSV)</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
            <button className="btn btn-ghost btn-sm" onClick={() => exportCatalog(catalogKey, list)}>
              <Icon name="download" /> <span>Export</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setEdit({})}>
              + Add
            </button>
          </div>
        </div>

        {live && lc.error && <div className="warn-banner show danger">{lc.error}</div>}
        {live && !lc.loaded ? (
          <p className="ai-soft">{translate('Loading the catalog…')}</p>
        ) : pg.total === 0 ? (
          <Empty title="No records match" text="Try another keyword or filter, or import the list from a file." />
        ) : (
          <div className="ai-table-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  {columns.map((c) => (
                    <th key={c.key} className={c.num ? 'num' : ''}>
                      {c.label}
                    </th>
                  ))}
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((r) => (
                  <tr key={r.id} className={'row-click' + (r.active ? '' : ' ai-dim')} onClick={() => setEdit(r)}>
                    <td className="mono">{r.code}</td>
                    <td>
                      <b>{r.name}</b>
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className={c.num ? 'num' : ''}>
                        {c.render ? c.render(r, cats, inv, c.key) : r[c.key] || <span className="ai-soft">—</span>}
                      </td>
                    ))}
                    <td>{r.active ? <span className="badge ok">In use</span> : <span className="badge muted">Discontinued</span>}</td>
                    <td className="ai-small">
                      <span className="mono">{fmtDate(r.updatedAt)}</span>
                      <div className="ai-soft">{r.updatedBy}</div>
                    </td>
                    <td className="ai-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEdit(r)}>
                        <Icon name="pencil" />
                      </button>
                      <button className="btn btn-ghost btn-sm" title={r.active ? 'Discontinue' : 'Re-activate'} onClick={() => setToggle(r)}>
                        <Icon name={r.active ? 'ban' : 'repeat'} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...pg} onPage={setPage} />
          </div>
        )}
        <p className="ai-foot-note">
          <Icon name="lock" />{' '}
          <span>Records are never deleted — discontinued codes stay readable on old records and invoices. Every change is written to the activity history.</span>
        </p>
      </div>

      {edit && <RowForm catalogKey={catalogKey} live={live} row={edit} all={all} cats={cats} inv={inv} user={user} onClose={() => setEdit(null)} />}
      <ConfirmDialog
        open={!!toggle}
        title={toggle ? translate(toggle.active ? 'Discontinue' : 'Re-activate') + ' · ' + toggle.code + ' ' + toggle.name : ''}
        message={toggle?.active ? 'The code can no longer be chosen for new records. Existing records keep it.' : 'The code can be chosen again.'}
        confirmLabel={toggle?.active ? 'Discontinue' : 'Re-activate'}
        danger={toggle?.active}
        requireNote={toggle?.active}
        onConfirm={async (note) => {
          if (live) {
            const r = await setLiveActive(catalogKey, toggle.id, !toggle.active)
            if (!r.ok) return showToast(translate(r.error))
          } else setRowActive(catalogKey, toggle.id, !toggle.active, user, s.title, note)
          showToast(toggle.active ? 'Record discontinued' : 'Record re-activated')
          setToggle(null)
        }}
        onCancel={() => setToggle(null)}
      />
      <ImportModal catalogKey={catalogKey} imp={imp} user={user} onClose={() => setImp(null)} />
    </div>
  )
}

// ---------- Form thêm / sửa ----------
function RowForm({ catalogKey, live, row, all, cats, inv, user, onClose }) {
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

function FieldInput({ fd, value, onChange, cats, inv }) {
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

function PackageItems({ value, onChange, cats }) {
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

function RxItems({ value, onChange, cats, inv }) {
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

function AdvicePick({ value, onChange, cats }) {
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

export { optLabel }

// Đọc file người dùng chọn → kết quả xem trước (số dòng mới / cập nhật / lỗi).
export function readCatalogFile(e, catalogKey, all, setImp) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const r = parseCatalogCsv(catalogKey, String(reader.result))
    const existing = new Set(all.map((x) => x.code.toLowerCase()))
    setImp({ fileName: file.name, ...r, added: r.rows.filter((x) => !existing.has(x.code.toLowerCase())).length })
  }
  reader.readAsText(file, 'utf-8')
}

export function ImportModal({ catalogKey, imp, user, onClose }) {
  const { showToast } = useToast()
  if (!imp) return null
  const s = SCHEMAS[catalogKey]
  const downloadTemplate = () =>
    exportCsv(`mau-${catalogKey}.csv`, s.csv, [s.csv.map((k) => (k === 'code' ? (catalogKey === 'icd' ? 'J02.0' : 'MA01') : k === 'name' ? 'Tên mẫu' : ''))])
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Import from Excel (CSV)') + ' · ' + translate(s.title) + ' · ' + imp.fileName} onClose={onClose} />
      <div className="modal-body">
        <p className="ai-hint">
          <span>Expected columns:</span> <code className="mono">{s.csv.join(',')}</code> ·{' '}
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
            <Icon name="download" /> <span>Template</span>
          </button>
        </p>
        <p>
          <b className="mono">{imp.added}</b> <span>new</span> · <b className="mono">{imp.rows.length - imp.added}</b> <span>existing codes will be updated</span> ·{' '}
          <b className="mono">{imp.errors.length}</b> <span>rows skipped</span>
        </p>
        {imp.errors.length > 0 && (
          <div className="warn-banner show caution">
            <div className="icon">
              <Icon name="alert" />
            </div>
            <div className="txt">
              {imp.errors.slice(0, 12).map((e) => (
                <div key={e.n}>
                  <span>Line</span> <span className="mono">{e.n}</span>: <span>{e.msg}</span>
                </div>
              ))}
              {imp.errors.length > 12 && <div>…</div>}
            </div>
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!imp.rows.length}
          onClick={() => {
            const r = importRows(catalogKey, imp.rows, user, s.title, imp.fileName)
            onClose()
            showToast(translate('Imported') + `: +${r.added}, ~${r.updated}`)
          }}
        >
          Import valid rows
        </button>
      </div>
    </Modal>
  )
}
