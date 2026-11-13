import { useEffect, useState } from 'react'
import PatientAlerts from '../../components/PatientAlerts'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { lookupPatients, getPatient } from '../../api/clinicApi'
import { ageOf } from '../../api/patient'
import ServerHistory from './ServerHistory'
import DocumentModal from './DocumentModal'

// Một ô tìm cho mọi khoá (mã BN, SĐT, CCCD, năm sinh, họ tên). Server tự ghi nhật ký VIEW mỗi lần xem.
export default function PatientLookup() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)
  const [last, setLast] = useState(null) // lượt gần nhất có chẩn đoán — cho giấy chuyển tuyến
  const [docs, setDocs] = useState(false)
  const [listOpen, setListOpen] = useState(true) // gõ lại thì mở danh sách kết quả, chọn xong thì thu lại

  // Gõ xong 300 ms mới hỏi server.
  useEffect(() => {
    const term = q.trim()
    if (!term) return setResults([])
    setSearching(true)
    const t = setTimeout(() => {
      lookupPatients(term, 30)
        .then((r) => (setResults(r), setErr('')), (e) => setErr(e.message))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  async function open(id) {
    setLast(null)
    setListOpen(false)
    try {
      setSel(await getPatient(id))
    } catch (e) {
      setErr(e.message)
    }
  }
  const p = sel
  const subject = p && {
    ...p,
    age: ageOf(p.dob),
    patientId: p.id,
    diagnosis: last?.diagnoses?.map((d) => [d.icd10_code, d.diagnosis_name].filter(Boolean).join(' — ')).join('; ') ?? '',
    rx: last?.prescription?.items.map((x) => ({ name: x.drug_label, qty: x.quantity })) ?? []
  }

  const initials = (name = '') =>
    name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')

  return (
    <div className="lookup2">
      <div className="card lookup-search">
        <div className="pl-q">
          <Icon name="search" />
          <input
            type="search"
            autoFocus
            placeholder="Name, phone number, record ID, ID card or birth year…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setListOpen(true)
            }}
          />
        </div>
        {err && <div className="kb-error">{err}</div>}
        {listOpen && q.trim() && (
          <div className="pl-results">
            {results.map((r) => (
              <button key={r.id} className={'pl-row' + (r.id === p?.id ? ' active' : '')} onClick={() => open(r.id)}>
                <span className="avatar sm">{initials(r.name)}</span>
                <span className="nm">{r.name}</span>
                <span className="sub">
                  <span className="mono">{r.code}</span> · {r.dob} · <span className="mono">{r.phone || '—'}</span>
                </span>
              </button>
            ))}
            {searching && <p className="ai-soft pl-hint">{translate('Loading…')}</p>}
            {!searching && !results.length && !err && <p className="ai-soft pl-hint">No patient matches.</p>}
          </div>
        )}
        {!q.trim() && !p && <p className="ai-soft pl-hint">Type at least part of a name, phone number or record ID.</p>}
      </div>

      {p ? (
        <div className="lookup-grid">
          <div className="card pt-card">
            <div className="pt-id">
              <span className="avatar lg">{initials(p.name)}</span>
              <div>
                <b>{p.name}</b>
                <span className="ai-soft">
                  <span className="mono">{p.code}</span> · {p.dob} ({ageOf(p.dob)} {translate('yrs')}) · {translate(p.gender)}
                </span>
              </div>
            </div>
            {p.pregnancy === 'yes' && <span className="badge warn">{translate('Pregnant')}</span>}
            <div className="pt-rows">
              <div className="pt-row">
                <span className="is-ico">
                  <Icon name="phone" />
                </span>
                <span>
                  <small>Phone</small>
                  <b className="mono">{p.phone || '—'}</b>
                </span>
              </div>
              <div className="pt-row">
                <span className="is-ico">
                  <Icon name="card" />
                </span>
                <span>
                  <small>ID card number (CCCD)</small>
                  <b className="mono">{p.idNumber || '—'}</b>
                </span>
              </div>
            </div>
            <PatientAlerts p={p} />
            <button className="btn btn-ghost btn-sm" onClick={() => setDocs(true)}>
              <Icon name="fileText" /> Referral letter
            </button>
          </div>
          <div className="card">
            <ServerHistory key={p.id} patientId={p.id} onLoaded={(h) => setLast(h.items.find((v) => v.diagnoses.length) ?? null)} />
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <Icon name="search" />
            <b>Find a patient</b>
            <span>Search by name, phone number or record ID to see their full history or print a referral letter.</span>
          </div>
        </div>
      )}
      {docs && subject && <DocumentModal subject={subject} onClose={() => setDocs(false)} />}
    </div>
  )
}
