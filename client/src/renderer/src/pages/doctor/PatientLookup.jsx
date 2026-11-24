import { useEffect, useState } from 'react'
import PatientAlerts from '../../components/PatientAlerts'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { lookupPatients, getPatient, patientVisits, getVisit } from '../../api/clinicApi'
import { ageOf } from '../../api/patient'
import ServerHistory from './ServerHistory'
import DocumentModal from './DocumentModal'
import { ErrorNote } from '../../components/DataState'
import Skeleton from '../../components/Skeleton'
import { todayVN } from '../../utils/format'

// Một ô tìm cho mọi khoá (mã BN, SĐT, CCCD, năm sinh, họ tên). Server tự ghi nhật ký VIEW mỗi lần xem.
export default function PatientLookup() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)
  const [last, setLast] = useState(null) // lượt gần nhất có chẩn đoán — cho giấy chuyển tuyến
  // Mang thai ghi theo lượt khám: chỉ hiện khi lượt hôm nay (chưa huỷ) ghi “đang mang thai”.
  const [pregnantNow, setPregnantNow] = useState(false)
  const [docs, setDocs] = useState(false)
  const [listOpen, setListOpen] = useState(true) // gõ lại thì mở danh sách kết quả, chọn xong thì thu lại

  // Gõ xong 300 ms mới hỏi server.
  useEffect(() => {
    const term = q.trim()
    if (!term) return setResults([])
    setSearching(true)
    const t = setTimeout(() => {
      lookupPatients(term, 30)
        .then(
          (r) => (setResults(r), setErr('')),
          (e) => setErr(e.message)
        )
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  async function open(id) {
    setLast(null)
    setPregnantNow(false)
    setListOpen(false)
    try {
      setSel(await getPatient(id))
    } catch (e) {
      setErr(e.message)
      return
    }
    try {
      const v = (await patientVisits(id, { limit: 1 })).items[0]
      if (v && v.status !== 'Cancelled' && new Date(v.at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) === todayVN()) setPregnantNow((await getVisit(v.id)).is_pregnant === true)
    } catch {
      /* không tải được lượt khám thì không hiện nhãn */
    }
  }
  const p = sel
  // Đang gõ tìm (hoặc bấm quay lại danh sách): kết quả chiếm khung chính; chọn một người thì hiện hồ sơ.
  const showList = !!q.trim() && (listOpen || !p)
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
        <div className="card-b">
          <div className="search w-full">
            <Icon name="search" />
            <input
              className="input"
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
          <ErrorNote>{err}</ErrorNote>
          {!q.trim() && !p && (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              {translate('Type at least part of a name, phone number or record ID.')}
            </p>
          )}
        </div>
      </div>

      {showList ? (
        <div className="card">
          <div className="card-h">
            <h3>
              <Icon name="users" />
              {translate('Search results')}
              <span className="muted fw-400">
                · {results.length}
              </span>
            </h3>
            {p && (
              <button className="btn btn-ghost btn-sm" onClick={() => setListOpen(false)}>
                {translate('Back to')} {p.name}
              </button>
            )}
          </div>
          <div className="card-b">
            {searching && !results.length ? (
              <Skeleton rows={4} cols={4} />
            ) : results.length ? (
              <div className="tbl-wrap">
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>{translate('Patient')}</th>
                      <th>{translate('Record ID')}</th>
                      <th>{translate('Date of birth')}</th>
                      <th>{translate('Phone')}</th>
                      <th className="r" />
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id} className={'click' + (r.id === p?.id ? ' on' : '')} onClick={() => open(r.id)}>
                        <td>
                          <span className="pl-who">
                            <span className="ava">{initials(r.name)}</span>
                            <b>{r.name}</b>
                          </span>
                        </td>
                        <td className="num">{r.code}</td>
                        <td className="num">
                          {r.dob}
                          {ageOf(r.dob) !== '' && <span className="muted"> · {ageOf(r.dob)} {translate('yrs')}</span>}
                        </td>
                        <td className="num">{r.phone || '—'}</td>
                        <td className="r">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              open(r.id)
                            }}
                          >
                            {translate('View record')}
                            <Icon name="chevron-right" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !err && (
                <div className="empty">
                  <div className="ill">
                    <Icon name="user-search" />
                  </div>
                  <b>{translate('No patient matches.')}</b>
                  <span>{translate('Check the spelling, or search by phone number or record ID instead.')}</span>
                </div>
              )
            )}
          </div>
        </div>
      ) : p ? (
        <div className="lookup-grid">
          <div className="card pt-card">
            <div className="pt-id">
              <span className="ava w-48 h-48 fs-md">
                {initials(p.name)}
              </span>
              <div>
                <b>{p.name}</b>
                <span className="muted">
                  <span className="num">{p.code}</span> · {p.dob} ({ageOf(p.dob)} {translate('yrs')}) · {translate(p.gender)}
                </span>
              </div>
            </div>
            {pregnantNow && <span className="badge b-warning">{translate('Pregnant')}</span>}
            <div className="pt-rows">
              <div className="pt-row">
                <span className="ico n">
                  <Icon name="phone" />
                </span>
                <span>
                  <small>Phone</small>
                  <b className="num">{p.phone || '—'}</b>
                </span>
              </div>
              <div className="pt-row">
                <span className="ico n">
                  <Icon name="id-card" />
                </span>
                <span>
                  <small>ID card number (CCCD)</small>
                  <b className="num">{p.idNumber || '—'}</b>
                </span>
              </div>
            </div>
            <PatientAlerts p={p} />
            <button className="btn btn-outline btn-sm" onClick={() => setDocs(true)}>
              <Icon name="file-output" />
              {translate('Referral letter')}
            </button>
          </div>
          <div className="card">
            {results.length > 1 && (
              <button className="link-btn small pl-back" onClick={() => setListOpen(true)}>
                <Icon name="chevron-left" />
                {translate('Search results')} ({results.length})
              </button>
            )}
            <ServerHistory key={p.id} patientId={p.id} onLoaded={(h) => setLast(h.items.find((v) => v.diagnoses.length) ?? null)} />
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty">
            <div className="ill">
              <Icon name="search" />
            </div>
            <b>{translate('Find a patient')}</b>
            <span>{translate('Search by name, phone number or record ID to see their full history or print a referral letter.')}</span>
          </div>
        </div>
      )}
      {docs && subject && <DocumentModal subject={subject} onClose={() => setDocs(false)} />}
    </div>
  )
}
