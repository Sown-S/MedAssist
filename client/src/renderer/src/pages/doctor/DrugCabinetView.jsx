import { useState } from 'react'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useQueue, isMine, inRoom } from '../../api/queueStore'
import { useInventory, stockOf, nearDays } from '../../api/inventoryStore'
import { unitLabel, fmtMoney, fmtDate, STATUS, Pager, paginate } from '../admin/inventory/shared'
import { addDrugToDraft } from './consult/rxDraft'
import { fold } from '../../utils/format'

const STOCK_FILTERS = [
  { key: '', label: 'All stock levels' },
  { key: 'ok', label: 'In stock' },
  { key: 'low', label: 'Low stock' },
  { key: 'out', label: 'Out of stock' }
]
// 'near' = theo ngưỡng “sắp hết hạn” ở Cài đặt › Vận hành.
const EXPIRY_FILTERS = [
  { key: '', label: 'All expiry dates' },
  { key: '30', label: 'Expiring within 30 days' },
  { key: 'near', label: 'Near expiry (clinic threshold)' },
  { key: 'expired', label: 'Has expired batches' }
]
// Nhóm điều trị theo chữ cái đầu của mã ATC — lọc theo nhóm bệnh mà không cần bảng thuốc–bệnh riêng.
const ATC_CLASSES = {
  A: 'Alimentary tract & metabolism',
  B: 'Blood & blood-forming organs',
  C: 'Cardiovascular system',
  D: 'Dermatologicals',
  G: 'Genito-urinary system & sex hormones',
  H: 'Systemic hormones',
  J: 'Anti-infectives (antibiotics…)',
  L: 'Antineoplastic & immunomodulating',
  M: 'Musculo-skeletal system',
  N: 'Nervous system (pain, sedatives…)',
  P: 'Antiparasitic products',
  R: 'Respiratory system & allergy',
  S: 'Sensory organs',
  V: 'Various'
}
const SORTS = [
  { key: 'name', label: 'Sort: name A–Z' },
  { key: 'expiry', label: 'Sort: nearest expiry' },
  { key: 'stock', label: 'Sort: lowest stock' }
]
const PAGE_SIZE = 20
const GROUPS = [
  { key: '', label: 'All groups' },
  { key: 'essential', label: 'Essential' },
  { key: 'supply', label: 'Medical supplies' }
]

// Tủ thuốc (bác sĩ chỉ xem): tồn dùng được, hạn gần nhất, giá, cảnh báo tương tác — để kê đúng thuốc đang có.
export default function DrugCabinetView({ go }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const inv = useInventory()
  const { visits } = useQueue()
  const [q, setQ] = useState('')
  const [stock, setStock] = useState('')
  const [group, setGroup] = useState('')
  const [atc, setAtc] = useState('')
  const [expiry, setExpiry] = useState('')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)
  const filter = (fn) => (e) => {
    fn(e.target.value)
    setPage(1)
  }
  const current = visits.find((v) => inRoom(v) && isMine(v, user))

  const needle = fold(q)
  const near = nearDays()
  const active = inv.drugs.filter((d) => d.active)
  const classes = [...new Set(active.map((d) => (d.atc ?? '').charAt(0)).filter((c) => ATC_CLASSES[c]))].sort()
  const expiresWithin = (s, days) => s.batches.some((b) => b.days >= 0 && b.days <= days)
  const list = active
    .map((d) => ({ d, s: stockOf(d, inv.batches) }))
    .filter(
      ({ d, s }) =>
        (!needle || fold([d.name, d.ingredient, d.atc].join(' ')).includes(needle)) &&
        (!stock || s.statuses.includes(stock)) &&
        (!group || (group === 'essential' ? d.essential : group === 'supply' ? d.kind === 'supply' : d.group === group)) &&
        (!atc || (atc === '-' ? !d.atc : (d.atc ?? '').startsWith(atc))) &&
        (!expiry || (expiry === 'expired' ? s.expired > 0 : expiresWithin(s, expiry === 'near' ? near : 30)))
    )
    .sort((a, b) =>
      sort === 'expiry'
        ? (a.s.nextExpiry?.expiry ?? '9999').localeCompare(b.s.nextExpiry?.expiry ?? '9999') || a.d.name.localeCompare(b.d.name)
        : sort === 'stock'
          ? a.s.usable - b.s.usable || a.d.name.localeCompare(b.d.name)
          : a.d.name.localeCompare(b.d.name)
    )
  const pg = paginate(list, page, PAGE_SIZE)

  function add(d) {
    addDrugToDraft(current, d)
    showToast(translate('Added to the prescription of') + ' ' + current.name)
    go('consult', current.id)
  }

  return (
    <>
      {current && (
        <div className="banner n">
          <Icon name="stethoscope" />
          <div className="txt">
            <span>Prescribing for</span> <b style={{ display: 'inline' }}>{current.name}</b>
            {current.allergies ? ' · ' + translate('Drug allergy') + ': ' + translate(current.allergies) : ''}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => go('consult', current.id)}>
            <Icon name="arrow-left" />
            {translate('Back to the consultation')}
          </button>
        </div>
      )}
      <div className="card">
        <div className="card-b">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <div className="search">
            <Icon name="search" />
            <input className="input" type="search" placeholder="Search by drug name, active ingredient or ATC…" value={q} onChange={filter(setQ)} />
          </div>
          <select className="select" value={atc} onChange={filter(setAtc)} title={translate('Therapeutic class (ATC)')}>
            <option value="">All drug classes (ATC)</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c} — {translate(ATC_CLASSES[c])}
              </option>
            ))}
            {active.some((d) => !d.atc) && <option value="-">No ATC code</option>}
          </select>
          <select className="select" value={group} onChange={filter(setGroup)}>
            {GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
          <select className="select" value={stock} onChange={filter(setStock)}>
            {STOCK_FILTERS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
          <select className="select" value={expiry} onChange={filter(setExpiry)}>
            {EXPIRY_FILTERS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.key === 'near' ? translate('Expiring within') + ' ' + near + ' ' + translate('days') : g.label}
              </option>
            ))}
          </select>
          <select className="select" value={sort} onChange={filter(setSort)}>
            {SORTS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
          <span className="muted small">
            {list.length} / {active.length} {translate(active.length === 1 ? 'drug' : 'drugs')}
          </span>
        </div>
        {list.length ? (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Labels</th>
                  <th className="r">Usable stock</th>
                  <th>Next expiry</th>
                  <th className="r">Price</th>
                  <th>Status</th>
                  {current && <th />}
                </tr>
              </thead>
              <tbody>
                {pg.rows.map(({ d, s }) => {
                  const main = s.statuses.find((x) => x !== 'ok') ?? 'ok'
                  return (
                    <tr key={d.id} className={s.usable === 0 ? 'dim' : ''}>
                      <td>
                        <b style={{ fontWeight: 500 }}>{d.name}</b>
                        <div className="muted small">
                          {d.ingredient || '—'}
                          {d.atc ? ' · ' + d.atc : ''}
                        </div>
                      </td>
                      <td>
                        <span className="acts" style={{ justifyContent: 'flex-start' }}>
                          {d.essential && <span className="tag">Essential</span>}
                          {d.group === 'controlled' && <span className="tag w">Controlled</span>}
                          {d.kind === 'supply' && <span className="tag">Supply</span>}
                          {!d.essential && d.group !== 'controlled' && d.kind !== 'supply' && <span className="plain">—</span>}
                        </span>
                      </td>
                      <td className="r num">
                        {s.usable.toLocaleString('vi-VN')} <span>{unitLabel(d.unit)}</span>
                      </td>
                      <td className="num">
                        {s.nextExpiry ? fmtDate(s.nextExpiry.expiry) : '—'}
                        {s.nextExpiry && s.nextExpiry.days <= near && (
                          <div className="small" style={{ color: s.nextExpiry.days <= 30 ? 'var(--danger)' : 'var(--warning)' }}>{translate(s.nextExpiry.days + ' days left')}</div>
                        )}
                      </td>
                      <td className="r num">{fmtMoney(d.price)}</td>
                      <td>
                        {main === 'ok' ? <span className="plain">{translate(STATUS.ok.label)}</span> : <span className={'badge ' + STATUS[main].cls}>{STATUS[main].label}</span>}
                      </td>
                      {current && (
                        <td className="r">
                          {d.kind === 'drug' && (
                            <button className="btn btn-outline btn-sm" disabled={s.usable === 0} onClick={() => add(d)} title={translate('Add to prescription')}>
                              <Icon name="plus" />
                              {translate('Add')}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <div className="ill">
              <Icon name="pill" />
            </div>
            <b>No drugs match.</b>
            <span>Try another name or clear the filters.</span>
          </div>
        )}
        {list.length > PAGE_SIZE && <Pager {...pg} onPage={setPage} />}
        </div>
      </div>
    </>
  )
}
