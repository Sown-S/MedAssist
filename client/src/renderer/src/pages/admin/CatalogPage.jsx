import { useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useLiveCatalog } from '../../api/serviceCatalogLive'
import { useInventory, todayISO } from '../../api/inventoryStore'
import { exportCsv, fmtDateTime, unitLabel } from './inventory/shared'
import { SCHEMAS } from './catalogs/schemas'
import { exportCatalog } from './catalogs/catalogCsv'

// Trang trung tâm của Quản lý danh mục; Thuốc & vật tư có trang riêng (dùng chung dữ liệu với Kho).
// Dịch vụ, Xét nghiệm, Gói khám lấy từ server.
const SERVER_KEYS = ['services', 'packages', 'labs']
const ORDER = [{ group: 'Medical catalogs', keys: ['@drugs', ...SERVER_KEYS] }]
const latest = (list, k = 'updatedAt') => list.reduce((m, r) => (r[k] > m ? r[k] : m), '')

function review(key, cats, inv) {
  const r = []
  if (key === 'packages' && cats.packages.some((p) => p.active && p.items.some((it) => !refActive(it.ref, cats)))) r.push('A package includes a discontinued service')
  if (key === '@drugs') {
    const n = inv.drugs.filter((d) => d.active && d.kind === 'drug' && !d.atc).length
    if (n) r.push(`${n} drugs without ATC code`)
  }
  return r
}
function refActive(ref, cats) {
  const [kind, code] = ref.split(':')
  return (kind === 'service' ? cats.services : cats.labs).find((x) => x.code === code)?.active
}

export default function CatalogPage({ onNavigate }) {
  const lc = useLiveCatalog(true)
  const cats = useMemo(() => ({ services: lc.services, labs: lc.labs, packages: lc.packages }), [lc.services, lc.labs, lc.packages])
  const inv = useInventory()
  const [q, setQ] = useState('')

  const info = (key) => {
    if (key === '@drugs')
      return { title: 'Drugs & supplies', desc: 'Active ingredient, ATC code, unit, prices, essential / controlled flags', list: inv.drugs, page: 'drugs', last: latest(inv.drugs) }
    const s = SCHEMAS[key]
    return { title: s.title, desc: s.desc, list: cats[key], page: 'cat-' + key, last: latest(cats[key]) }
  }

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    const out = []
    for (const key of SERVER_KEYS)
      for (const r of cats[key]) if ([r.code, r.name, r.nameEn].some((x) => (x ?? '').toLowerCase().includes(t))) out.push({ key, page: 'cat-' + key, code: r.code, name: r.name, active: r.active, id: r.id })
    for (const d of inv.drugs) if ([d.name, d.ingredient, d.atc].some((x) => (x ?? '').toLowerCase().includes(t))) out.push({ key: '@drugs', page: 'drugs', code: d.atc || d.id, name: d.name, active: d.active })
    return out.slice(0, 40)
  }, [q, cats, inv])

  function exportRow(key) {
    if (key === '@drugs')
      return exportCsv(
        `danh-muc-thuoc-${todayISO()}.csv`,
        ['Code', 'Name', 'Active ingredient', 'ATC code', 'Unit', 'Purchase price', 'Selling price', 'Essential', 'Controlled', 'Status'],
        inv.drugs.map((d) => [d.id, d.name, d.ingredient, d.atc, translate(unitLabel(d.unit)), d.cost, d.price, d.essential ? 'x' : '', d.group === 'controlled' ? 'x' : '', translate(d.active ? 'In use' : 'Discontinued')])
      )
    exportCatalog(key, cats[key])
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Catalog management</h1>
          <p>Administrative &amp; medical catalogs shared across the system — click a row to open it</p>
        </div>
      </div>

      <div className="card cat-search-card">
        <div className="ai-search cat-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a code or name in every catalog (e.g. J03, Amoxicillin, Đà Nẵng)…" />
        </div>
        {q.trim().length >= 2 && (
          <div className="cat-results">
            {results.length === 0 ? (
              <p className="ai-soft">No results.</p>
            ) : (
              results.map((r, i) => (
                <div
                  key={i}
                  className={'cat-result' + (r.active ? '' : ' ai-dim')}
                  onClick={() => onNavigate(r.page, r.page.startsWith('cat-') ? { q: r.code, openId: r.id } : { q: r.name })}
                >
                  <span className="badge">{info(r.key).title}</span> <b className="mono">{r.code}</b> <span>{r.name}</span>
                  {!r.active && <span className="badge muted">Discontinued</span>}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {ORDER.map(({ group, keys }) => (
        <div className="card" style={{ marginTop: 14 }} key={group}>
          <div className="card-title">{group}</div>
          <table className="dt">
            <thead>
              <tr>
                <th>Catalog</th>
                <th className="num">Records</th>
                <th>Last updated</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const x = info(key)
                const active = x.list.filter((r) => r.active).length
                const issues = review(key, cats, inv)
                return (
                  <tr key={key} className="row-click" onClick={() => onNavigate(x.page)}>
                    <td>
                      <b>{x.title}</b>
                      <div className="ai-soft ai-small">{x.desc}</div>
                    </td>
                    <td className="num">
                      <b className="mono">{active}</b>
                      {active !== x.list.length && (
                        <div className="ai-soft ai-small">
                          / <span className="mono">{x.list.length}</span> <span>total</span>
                        </div>
                      )}
                    </td>
                    <td className="mono ai-small">{fmtDateTime(x.last)}</td>
                    <td>
                      {issues.length ? (
                        <>
                          <span className="badge warn">Needs review</span>
                          {issues.map((t) => (
                            <div key={t} className="ai-small sp-warn cat-issue">
                              {t}
                            </div>
                          ))}
                        </>
                      ) : (
                        <span className="badge ok">In use</span>
                      )}
                    </td>
                    <td className="ai-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" title="Export" onClick={() => exportRow(key)}>
                        <Icon name="download" />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Open" onClick={() => onNavigate(x.page)}>
                        <Icon name="chevronRight" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

