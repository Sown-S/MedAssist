import { useEffect, useState } from 'react'
import PatientAlerts from '../../components/PatientAlerts'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { lookupPatients, getPatient } from '../../api/clinicApi'
import { ageOf } from '../../api/patientStore'
import ServerHistory from './ServerHistory'
import DocumentModal from './DocumentModal'

// Tra cứu hồ sơ bệnh nhân với backend thật (FR04, US04): một ô tìm kiếm (mã BN, SĐT, CCCD, năm sinh, họ tên)
// → hồ sơ + toàn bộ lịch sử khám từ server. Mỗi lần xem server tự ghi nhật ký VIEW (không cần ghi ở client).
export default function PatientLookupLive() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null) // hồ sơ đầy đủ (getPatient)
  const [last, setLast] = useState(null) // lượt khám gần nhất có chẩn đoán — cho giấy chuyển tuyến
  const [docs, setDocs] = useState(false)

  // Gõ xong 300 ms mới hỏi server (không gửi mỗi phím).
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

  return (
    <div className="lookup">
      <div className="card lookup-list">
        <input className="pl-search" type="search" autoFocus placeholder="Name, phone number, record ID, ID card or birth year…" value={q} onChange={(e) => setQ(e.target.value)} />
        {err && <div className="kb-error">{err}</div>}
        {results.map((r) => (
          <button key={r.id} className={'pl-row' + (r.id === p?.id ? ' active' : '')} onClick={() => open(r.id)}>
            <span className="nm">{r.name}</span>
            <span className="sub">
              <span className="mono">{r.code}</span> · {r.dob} · <span className="mono">{r.phone || '—'}</span>
            </span>
          </button>
        ))}
        {searching && <p className="ai-soft" style={{ fontSize: 13, padding: 8 }}>{translate('Loading…')}</p>}
        {q.trim() && !searching && !results.length && !err && <p className="ai-soft" style={{ fontSize: 13, padding: 8 }}>No patient matches.</p>}
        {!q.trim() && <p className="ai-soft" style={{ fontSize: 13, padding: 8 }}>Type at least part of a name, phone number or record ID.</p>}
      </div>

      {p ? (
        <div className="card">
          <div className="consult-head">
            <div>
              <h2>{p.name}</h2>
              <div className="sub">
                {translate(p.gender)} · {p.dob} ({ageOf(p.dob)} {translate('yrs')}) · <span className="mono">{p.code}</span> · <span className="mono">{p.phone || '—'}</span>
              </div>
            </div>
            {p.pregnancy === 'yes' && <span className="badge warn">{translate('Pregnant')}</span>}
          </div>
          <PatientAlerts p={p} />
          <div className="lookup-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setDocs(true)}>
              <Icon name="repeat" /> Referral letter
            </button>
          </div>
          <ServerHistory key={p.id} patientId={p.id} onLoaded={(h) => setLast(h.items.find((v) => v.diagnoses.length) ?? null)} />
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
