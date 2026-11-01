import { useState } from 'react'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useQueue, isMine, inRoom } from '../../api/queueStore'
import { useInventory, stockOf, nearDays } from '../../api/inventoryStore'
import { fold } from '../../api/patient'
import { unitLabel, fmtMoney, fmtDate, STATUS, Pager, paginate } from '../admin/inventory/shared'
import { addDrugToDraft } from './consult/rxDraft'

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
const PAGE_SIZE = 12
const GROUPS = [
  { key: '', label: 'All groups' },
  { key: 'essential', label: 'Essential' },
  { key: 'controlled', label: 'Controlled drugs' },
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
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cash-filters" style={{ marginBottom: 0 }}>
          <input className="grow" type="search" placeholder="Search by drug name, active ingredient or ATC…" value={q} onChange={filter(setQ)} />
          <select value={atc} onChange={filter(setAtc)} title={translate('Therapeutic class (ATC)')}>
            <option value="">All drug classes (ATC)</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c} — {translate(ATC_CLASSES[c])}
              </option>
            ))}
            {active.some((d) => !d.atc) && <option value="-">No ATC code</option>}
          </select>
          <select value={group} onChange={filter(setGroup)}>
            {GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
          <select value={stock} onChange={filter(setStock)}>
            {STOCK_FILTERS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
          <select value={expiry} onChange={filter(setExpiry)}>
            {EXPIRY_FILTERS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.key === 'near' ? translate('Expiring within') + ' ' + near + ' ' + translate('days') : g.label}
              </option>
            ))}
          </select>
          <select value={sort} onChange={filter(setSort)}>
            {SORTS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
          <span className="ai-soft" style={{ fontSize: 13 }}>
            {list.length} / {active.length} {translate('drugs')}
          </span>
        </div>
        {current && (
          <p className="ai-soft" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
            <Icon name="stethoscope" /> <span>Prescribing for</span> <b>{current.name}</b> — <span>use “Add to prescription” on a drug card.</span>
          </p>
        )}
      </div>

      <div className="drug-grid">
        {pg.rows.map(({ d, s }) => {
          const main = s.statuses.find((x) => x !== 'ok') ?? 'ok'
          return (
            <div className={'drug-card' + (s.usable === 0 ? ' out' : '')} key={d.id}>
              <div className="drug-top">
                <div>
                  <b>{d.name}</b>
                  <small>
                    {d.ingredient || '—'}
                    {d.atc ? ' · ATC ' + d.atc : ''}
                  </small>
                </div>
                <span className={'badge ' + STATUS[main].cls}>{STATUS[main].label}</span>
              </div>
              <div className="drug-tags">
                {d.essential && <span className="essential-chip">Essential</span>}
                {d.group === 'controlled' && <span className="badge warn">Controlled</span>}
                {d.kind === 'supply' && <span className="badge muted">Supply</span>}
              </div>
              <div className="drug-facts">
                <span>
                  <Icon name="box" /> <span>Usable stock</span>: <b className="mono">{s.usable.toLocaleString('vi-VN')}</b> <span>{unitLabel(d.unit)}</span>
                </span>
                <span>
                  <Icon name="calendar" /> <span>Next expiry</span>: <b className="mono">{s.nextExpiry ? fmtDate(s.nextExpiry.expiry) : '—'}</b>
                  {s.nextExpiry && (
                    <span className={'exp-days' + (s.nextExpiry.days <= 30 ? ' soon' : s.nextExpiry.days <= near ? ' near' : '')}>{translate(s.nextExpiry.days + ' days left')}</span>
                  )}
                </span>
                <span>
                  <Icon name="banknote" /> <span>Price</span>: <b className="mono">{fmtMoney(d.price)}</b> / <span>{unitLabel(d.unit)}</span>
                </span>
              </div>
              {current && d.kind === 'drug' && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 'auto' }} disabled={s.usable === 0} onClick={() => add(d)}>
                  + Add to prescription
                </button>
              )}
            </div>
          )
        })}
      </div>
      {list.length > PAGE_SIZE && (
        <div className="card" style={{ marginTop: 14, padding: '4px 10px 10px' }}>
          <Pager {...pg} onPage={setPage} />
        </div>
      )}
      {!list.length && (
        <div className="card">
          <div className="empty-state">
            <Icon name="box" />
            <b>No drugs match.</b>
            <span>Try another name or clear the filters.</span>
          </div>
        </div>
      )}
    </>
  )
}
