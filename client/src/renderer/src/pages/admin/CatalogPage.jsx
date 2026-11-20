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
    if (key === '@drugs') return { title: 'Drugs & supplies', desc: 'Active ingredient, ATC code, unit, prices, essential / controlled flags', list: inv.drugs, page: 'drugs', last: latest(inv.drugs) }
    const s = SCHEMAS[key]
    return { title: s.title, desc: s.desc, list: cats[key], page: 'cat-' + key, last: latest(cats[key]) }
  }

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    const out = []
    for (const key of SERVER_KEYS)
      for (const r of cats[key])
        if ([r.code, r.name, r.nameEn].some((x) => (x ?? '').toLowerCase().includes(t))) out.push({ key, page: 'cat-' + key, code: r.code, name: r.name, active: r.active, id: r.id })
    for (const d of inv.drugs)
      if ([d.name, d.ingredient, d.atc].some((x) => (x ?? '').toLowerCase().includes(t))) out.push({ key: '@drugs', page: 'drugs', code: d.atc || d.id, name: d.name, active: d.active })
    return out.slice(0, 40)
  }, [q, cats, inv])

  function exportRow(key) {
    if (key === '@drugs')
      return exportCsv(
        `danh-muc-thuoc-${todayISO()}.csv`,
        ['Code', 'Name', 'Active ingredient', 'ATC code', 'Unit', 'Purchase price', 'Selling price', 'Essential', 'Controlled', 'Status'],
        inv.drugs.map((d) => [
          d.id,
          d.name,
          d.ingredient,
          d.atc,
          translate(unitLabel(d.unit)),
          d.cost,
          d.price,
          d.essential ? 'x' : '',
          d.group === 'controlled' ? 'x' : '',
          translate(d.active ? 'In use' : 'Discontinued')
        ])
      )
    exportCatalog(key, cats[key])
  }

  const CAT_ICON = { '@drugs': 'pill', services: 'clipboard-list', packages: 'package', labs: 'flask-conical', icd10: 'book-open', general: 'list' }
  return (
    <div className="vflow">
      <div className="pg-h">
        <div>
          <h2>Catalog management</h2>
          <p>Administrative &amp; medical catalogs shared across the system — click a row to open it</p>
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="search" style={{ width: '100%', marginBottom: 14 }}>
            <Icon name="search" />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a code or name in every catalog (e.g. J03, Amoxicillin, Đà Nẵng)…" />
          </div>
          {q.trim().length >= 2 && (
            <div className="rows" style={{ marginBottom: 14 }}>
              {results.length === 0 ? (
                <p className="muted small">{translate('No results.')}</p>
              ) : (
                results.map((r, i) => (
                  <div
                    key={i}
                    className={'r clickable' + (r.active ? '' : ' dim')}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavigate(r.page, r.page.startsWith('cat-') ? { q: r.code, openId: r.id } : { q: r.name })}
                  >
                    <span className="tag">{info(r.key).title}</span>
                    <div className="t">
                      <b className="num">{r.code}</b> <span>{r.name}</span>
                    </div>
                    {!r.active && <span className="badge b-neutral">{translate('Discontinued')}</span>}
                  </div>
                ))
              )}
            </div>
          )}

          {ORDER.map(({ group, keys }) => (
            <div key={group}>
              {ORDER.length > 1 && <div className="sec-t">{translate(group)}</div>}
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Catalog</th>
                      <th className="r">Records</th>
                      <th>Last updated</th>
                      <th>Status</th>
                      <th className="r">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => {
                      const x = info(key)
                      const active = x.list.filter((r) => r.active).length
                      const issues = review(key, cats, inv)
                      return (
                        <tr key={key} className="clickable" onClick={() => onNavigate(x.page)}>
                          <td>
                            <div className="who-cell">
                              <div className="ico n">
                                <Icon name={CAT_ICON[key] ?? 'list'} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <b>{x.title}</b>
                                <span className="clip" style={{ display: 'block', maxWidth: 420 }}>
                                  {x.desc}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="r num">
                            {active.toLocaleString('vi-VN')}
                            {active !== x.list.length && (
                              <div className="muted small">
                                / <span className="num">{x.list.length}</span> <span>total</span>
                              </div>
                            )}
                          </td>
                          <td className="num">{fmtDateTime(x.last)}</td>
                          <td>
                            {issues.length ? (
                              <>
                                <span className="badge b-warning">Needs review</span>
                                {issues.map((t) => (
                                  <div key={t} className="small" style={{ color: 'var(--warning)' }}>
                                    {t}
                                  </div>
                                ))}
                              </>
                            ) : (
                              <span className="plain">{translate('In use')}</span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="acts">
                              <button className="btn btn-ghost btn-sm" title={translate('Export')} onClick={() => exportRow(key)}>
                                <Icon name="download" />
                                {translate('Export')}
                              </button>
                              <button className="btn btn-outline btn-sm" onClick={() => onNavigate(x.page)}>
                                {translate('Open')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
