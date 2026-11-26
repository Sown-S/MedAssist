import { useState } from 'react'
import Icon from './Icon'
import { translate } from '../i18n'
import { STATES, useSymptomCatalog, fitsSex, groupSymptoms, searchSymptoms, symptomName, isDangerSymptom, isExamSign, displayName, fullNameTitle, DANGER, OUT_OF_SCOPE } from '../api/symptoms'

// Danh sách triệu chứng cho y tá, từ trên xuống: ô tìm (gõ không dấu) → “Đã xác nhận” → Dấu hiệu nguy hiểm (mở sẵn)
// → các nhóm khác (đóng sẵn, tiêu đề có số đã chọn). Mục đã chọn vẫn nằm trong nhóm của nó, được tô nổi.
// Hiện tên ngắn (rê chuột xem tên đầy đủ). Dấu hiệu khi khám (detection = exam) không hiện ở đây: bác sĩ ghi lúc khám.
const SOURCE_LABEL = { Form: 'Picked by nurse', Extracted: 'From description', Prompt: 'Asked (missing info)' }
// Kết quả tìm hiện trước bấy nhiêu mục; nhiều hơn thì có nút hiện hết, để không ai tưởng chỉ có bấy nhiêu.
const RESULTS_SHOWN = 8
const nameOf = (s) => (s.key === OUT_OF_SCOPE ? translate('Dangerous sign not in the list') : translate(displayName(s)))
const titleOf = (s) => (s.key === OUT_OF_SCOPE ? undefined : fullNameTitle(s))
const OutOfScopeHint = () => <small>{translate('e.g. multiple trauma, heavy bleeding — describe it in the patient’s description')}</small>

const TRI = { PRESENT: 'y', ABSENT: 'n', UNKNOWN: 'u' }
function StateButtons({ cur, onPick, disabled, states = STATES }) {
  return (
    <span className="tri">
      {states.map((x) => (
        <button type="button" key={x.key} disabled={disabled} className={TRI[x.key] + (cur === x.key ? ' on' : '')} aria-pressed={cur === x.key} onClick={() => onPick(x.key)}>
          {translate(x.label)}
        </button>
      ))}
    </span>
  )
}

function Row({ s, value, onSet, disabled }) {
  const cur = value[s.key]?.state ?? 'UNKNOWN'
  return (
    <div className={'sym-r' + (isDangerSymptom(s) ? ' d' : '') + (cur !== 'UNKNOWN' ? ' set' : '')}>
      <span className="sn" title={titleOf(s)}>
        {nameOf(s)}
        {s.key === OUT_OF_SCOPE && <OutOfScopeHint />}
      </span>
      <StateButtons cur={cur} disabled={disabled} onPick={(state) => onSet(s.key, state)} />
    </div>
  )
}

// gender: giới tính bệnh nhân — ẩn triệu chứng không hợp (vd khí hư âm đạo với nam); Khác / chưa chọn thì không lọc.
export default function SymptomChecklist({ value, onSet, disabled = false, gender = '' }) {
  const catalog = useSymptomCatalog()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [openGroups, setOpenGroups] = useState({})
  const askable = catalog.list.filter((s) => !isExamSign(s) && fitsSex(s, gender))
  const groups = groupSymptoms(askable)
  const byKey = new Map(catalog.list.map((s) => [s.key, s]))

  // Đã xác nhận: dấu hiệu nguy hiểm lên đầu, còn lại giữ thứ tự chọn.
  const confirmed = Object.entries(value)
    .filter(([, x]) => x && x.state !== 'UNKNOWN')
    .map(([key, x]) => ({ s: byKey.get(key) ?? { key, label: symptomName(key) }, ...x }))
    .sort((a, b) => isDangerSymptom(b.s) - isDangerSymptom(a.s))
  const results = searchSymptoms(askable, query)
  const hidden = showAll ? 0 : Math.max(0, results.length - RESULTS_SHOWN)
  const shown = hidden ? results.slice(0, RESULTS_SHOWN) : results

  return (
    <div className="sym-checklist">
      {catalog.status === 'loading' && <p className="muted small">{translate('Loading the symptom list…')}</p>}
      {catalog.status === 'failed' && (
        <div className="hint-w">
          <Icon name="triangle-alert" /> {translate('Could not load the symptom list from the server.')}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={catalog.reload}>
            {translate('Try again')}
          </button>
        </div>
      )}

      {catalog.list.length > 0 && (
        <div className="mt-12">
          <div className="search w-full">
            <Icon name="search" />
            <input
              className="input"
              type="search"
              value={query}
              disabled={disabled}
              placeholder={translate('Search symptoms — accents not needed (e.g. dau bung)')}
              aria-label={translate('Search symptoms')}
              onChange={(e) => (setQuery(e.target.value), setShowAll(false))}
              onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), setShowAll(false))}
            />
          </div>
          {query.trim() && (
            <div className="sym-sec open sym-results mt-8">
              <div className="sym-grid pt-10">
                {results.length ? (
                  shown.map((s) => <Row key={s.key} s={s} value={value} onSet={onSet} disabled={disabled} />)
                ) : (
                  <p className="sym-empty p-0">
                    {translate('No matching symptom.')}
                  </p>
                )}
                {hidden > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)}>
                    {translate(`Show ${hidden} more`)}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="sym-list">
        <div className="sym-sec conf">
          <div className="sym-g st">
            <Icon name="check" />
            <span>{translate('Confirmed symptoms')}</span>
            <span className="sym-c">{confirmed.length}</span>
          </div>
          {confirmed.length ? (
            <div className="sym-grid">
              {confirmed.map(({ s, state, source }) => (
                <div key={s.key} className={'sym-r set' + (isDangerSymptom(s) ? ' d' : '')}>
                  <span className="sn" title={titleOf(s)}>
                    {nameOf(s)}
                    <small>{translate(SOURCE_LABEL[source] ?? SOURCE_LABEL.Form)}</small>
                  </span>
                  <StateButtons cur={state} disabled={disabled} states={STATES.filter((x) => x.key !== 'UNKNOWN')} onPick={(next) => next !== state && onSet(s.key, next)} />
                  <button type="button" className="btn btn-ghost btn-icon" disabled={disabled} onClick={() => onSet(s.key, 'UNKNOWN')} title={translate('Remove')} aria-label={translate('Remove')}>
                    <Icon name="x" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="sym-empty">{translate('Nothing confirmed yet — confirm the suggestions above or pick below.')}</p>
          )}
        </div>

        {groups.map((g) => {
          const picked = g.items.filter((s) => value[s.key] && value[s.key].state !== 'UNKNOWN').length
          const isOpen = !g.label || (openGroups[g.key] ?? g.key === DANGER)
          return (
            <div key={g.key} className={'sym-sec' + (g.key === DANGER ? ' danger' : '') + (isOpen ? ' open' : '')}>
              {g.label && (
                <button type="button" className="sym-g" aria-expanded={isOpen} onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !isOpen }))}>
                  <Icon name="chevron-right" />
                  <span>{translate(g.label)}</span>
                  <span className="sym-p">{picked > 0 ? translate(`${picked} selected`) : ''}</span>
                  <span className="sym-c">{g.items.length}</span>
                </button>
              )}
              {isOpen && (
                <div className="sym-grid" style={g.label ? undefined : { paddingTop: 10 }}>
                  {g.items.map((s) => (
                    <Row key={s.key} s={s} value={value} onSet={onSet} disabled={disabled} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
