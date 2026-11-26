import { useState } from 'react'
import Icon from '../../../components/Icon'
import Button from '../../../components/Button'
import { translate } from '../../../i18n'
import { useToast } from '../../../context/ToastContext'
import { STATES, useSymptomCatalog, fitsSex, searchSymptoms, isExamSign, isExamCode, displayName, fullNameTitle } from '../../../api/symptoms'
import { putSymptoms, triggerAssessment } from '../../../api/clinicApi'
import { ApiError } from '../../../api/client'

// Hiện ô tìm khi danh sách dài hơn bấy nhiêu mục.
const SEARCH_FROM = 10
const TRI = { PRESENT: 'y', ABSENT: 'n', UNKNOWN: 'u' }
const toMap = (list) => Object.fromEntries((list ?? []).filter((x) => x.state !== 'UNKNOWN' && isExamCode(x.symptom_code)).map((x) => [x.symptom_code, x.state]))

// "Dấu hiệu khi khám" (O): mã detection = exam, chỉ bác sĩ ghi. Lưu qua PUT /visits/{id}/symptoms — API thay toàn bộ danh
// sách, nên gửi kèm nguyên các triệu chứng lễ tân đã xác nhận (giữ trạng thái và nguồn), chỉ thay phần dấu hiệu khi khám.
// symptoms: danh sách đã xác nhận hiện tại (server trả); onSaved(list) nhận danh sách mới; onRerun() khi đã chạy lại AI.
// Chờ danh mục nạp xong mới dựng phần thân: cần detection để biết mã nào là dấu hiệu khi khám.
export default function ExamSigns(props) {
  const catalog = useSymptomCatalog()
  if (catalog.status !== 'ready') return null
  return <ExamSignsBody {...props} signs={catalog.list.filter((s) => isExamSign(s) && fitsSex(s, props.gender))} />
}

function ExamSignsBody({ visitId, symptoms, onSaved, onRerun, signs }) {
  const { showToast } = useToast()
  const [saved, setSaved] = useState(() => toMap(symptoms))
  const [draft, setDraft] = useState(saved)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const codes = new Set([...Object.keys(saved), ...Object.keys(draft)])
  const dirty = [...codes].some((c) => saved[c] !== draft[c])
  const count = Object.keys(draft).length
  const shown = query.trim() ? searchSymptoms(signs, query) : signs

  const pick = (code, state) =>
    setDraft((m) => {
      const next = { ...m }
      if (state === 'UNKNOWN') delete next[code]
      else next[code] = state
      return next
    })

  async function save() {
    setBusy(true)
    setNote('')
    try {
      const reported = (symptoms ?? []).filter((x) => x.state !== 'UNKNOWN' && !isExamCode(x.symptom_code)).map((x) => ({ symptom_code: x.symptom_code, state: x.state, source: x.source }))
      const exam = Object.entries(draft).map(([symptom_code, state]) => ({ symptom_code, state, source: 'Form' }))
      const rows = await putSymptoms(visitId, [...reported, ...exam])
      const list = rows.filter((x) => x.state !== 'UNKNOWN')
      const next = toMap(list)
      setSaved(next)
      setDraft(next)
      onSaved?.(list)
      // Chạy lại AI để gợi ý tính cả dấu hiệu vừa ghi. Không chạy lại được (409 NOT_YOUR_VISIT: bác sĩ không phải người đang
      // khám lượt này; 403: server cũ chưa cho bác sĩ chạy lại) → dấu hiệu vẫn đã lưu, báo gợi ý AI chưa tính chúng.
      try {
        await triggerAssessment(visitId)
        onRerun?.()
        showToast(translate('Examination signs saved — AI suggestion is being updated'), 'success')
      } catch (e) {
        if (!(e instanceof ApiError) || ![403, 409].includes(e.status)) throw e
        setNote(translate('Saved to the visit. The AI suggestion below was made from the check-in symptoms and does not include these signs yet.'))
        showToast(translate('Examination signs saved'), 'success')
      }
    } catch (e) {
      showToast(translate(e.message), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="exam-signs">
      <div className="exam-signs-head">
        <span className="lab">
          <Icon name="stethoscope" /> {translate('Examination signs')}
          {count > 0 && <span className="cnt">{count}</span>}
        </span>
        <small className="muted">{translate('Signs found when examining — not asked at reception')}</small>
      </div>
      {!signs.length ? (
        <p className="muted small">{translate('The current knowledge release has no examination signs yet.')}</p>
      ) : (
        <>
          {signs.length > SEARCH_FROM && (
            <div className="search w-full mb-8">
              <Icon name="search" />
              <input className="input" type="search" value={query} placeholder={translate('Search examination signs — accents not needed')} aria-label={translate('Search examination signs')} onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
          <div className="exam-signs-grid">
            {shown.map((s) => {
              const cur = draft[s.key] ?? 'UNKNOWN'
              return (
                <div key={s.key} className={'sym-r' + (cur !== 'UNKNOWN' ? ' set' : '')}>
                  <span className="sn" title={fullNameTitle(s)}>
                    {translate(displayName(s))}
                  </span>
                  <span className="tri">
                    {STATES.map((x) => (
                      <button type="button" key={x.key} disabled={busy} className={TRI[x.key] + (cur === x.key ? ' on' : '')} aria-pressed={cur === x.key} onClick={() => pick(s.key, x.key)}>
                        {translate(x.label)}
                      </button>
                    ))}
                  </span>
                </div>
              )
            })}
            {!shown.length && <p className="muted small">{translate('No matching sign.')}</p>}
          </div>
          <div className="exam-signs-foot">
            {note && (
              <span className="exam-signs-note">
                <Icon name="info" /> {note}
              </span>
            )}
            {dirty && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDraft(saved)}>
                {translate('Undo changes')}
              </button>
            )}
            <Button className="btn btn-primary btn-sm" disabled={!dirty} loading={busy} onClick={save} data-shortcut="save">
              <Icon name="check" /> {translate('Save examination signs')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
