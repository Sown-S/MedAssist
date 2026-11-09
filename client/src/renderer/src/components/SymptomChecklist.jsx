import { useState } from 'react'
import Icon from './Icon'
import { translate } from '../i18n'
import { STATES, useSymptomCatalog, groupSymptoms, searchSymptoms, symptomName, isDangerSymptom, DANGER, OUT_OF_SCOPE } from '../api/symptoms'

// Danh sách triệu chứng cho y tá, từ trên xuống: ô tìm (gõ không dấu) → “Đã xác nhận” → Dấu hiệu nguy hiểm (mở sẵn)
// → các nhóm khác (đóng sẵn, tiêu đề có số đã chọn). Mục đã chọn vẫn nằm trong nhóm của nó, được tô nổi.
const SOURCE_LABEL = { Form: 'Picked by nurse', Extracted: 'From description', Prompt: 'Asked (missing info)' }
// Kết quả tìm hiện trước bấy nhiêu mục; nhiều hơn thì có nút hiện hết, để không ai tưởng chỉ có bấy nhiêu.
const RESULTS_SHOWN = 8
const nameOf = (s) => (s.key === OUT_OF_SCOPE ? translate('Dangerous sign not in the list') : translate(s.label))
const OutOfScopeHint = () => <small className="sym-hint">{translate('e.g. multiple trauma, heavy bleeding — describe it in the patient’s description')}</small>

function StateButtons({ cur, onPick, disabled, states = STATES }) {
  return (
    <span className="ai-seg sym-seg">
      {states.map((x) => (
        <button type="button" key={x.key} disabled={disabled} className={(cur === x.key ? 'active ' : '') + x.key.toLowerCase()} aria-pressed={cur === x.key} onClick={() => onPick(x.key)}>
          {translate(x.label)}
        </button>
      ))}
    </span>
  )
}

function Row({ s, value, onSet, disabled }) {
  const cur = value[s.key]?.state ?? 'UNKNOWN'
  return (
    <div className={'sym-row' + (cur !== 'UNKNOWN' ? ' set' : '')}>
      <span className="sym-name">
        {nameOf(s)}
        {s.key === OUT_OF_SCOPE && <OutOfScopeHint />}
      </span>
      <StateButtons cur={cur} disabled={disabled} onPick={(state) => onSet(s.key, state)} />
    </div>
  )
}

export default function SymptomChecklist({ value, onSet, disabled = false }) {
  const catalog = useSymptomCatalog()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [openGroups, setOpenGroups] = useState({})
  const groups = groupSymptoms(catalog.list)
  const byKey = new Map(catalog.list.map((s) => [s.key, s]))

  // Đã xác nhận: dấu hiệu nguy hiểm lên đầu, còn lại giữ thứ tự chọn.
  const confirmed = Object.entries(value)
    .filter(([, x]) => x && x.state !== 'UNKNOWN')
    .map(([key, x]) => ({ s: byKey.get(key) ?? { key, label: symptomName(key) }, ...x }))
    .sort((a, b) => isDangerSymptom(b.s) - isDangerSymptom(a.s))
  const results = searchSymptoms(catalog.list, query)
  const hidden = showAll ? 0 : Math.max(0, results.length - RESULTS_SHOWN)
  const shown = hidden ? results.slice(0, RESULTS_SHOWN) : results

  return (
    <div className="sym-checklist">
      {catalog.status === 'loading' && <p className="ai-soft">{translate('Loading the symptom list…')}</p>}
      {catalog.status === 'failed' && (
        <p className="sym-warn">
          <Icon name="alert" /> {translate('Could not load the symptom list from the server.')}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={catalog.reload}>
            {translate('Try again')}
          </button>
        </p>
      )}

      {catalog.list.length > 0 && (
        <div className="sym-search">
          <div className="ai-search sym-search-box">
            <Icon name="search" />
            <input
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
            <div className="sym-results">
              {results.length ? shown.map((s) => <Row key={s.key} s={s} value={value} onSet={onSet} disabled={disabled} />) : <p className="ai-soft">{translate('No matching symptom.')}</p>}
              {hidden > 0 && (
                <button type="button" className="btn btn-ghost btn-sm sym-more" onClick={() => setShowAll(true)}>
                  {translate(`Show ${hidden} more`)}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="sym-section grouped confirmed">
        <div className="sym-group static">
          <Icon name="check" />
          <span>{translate('Confirmed symptoms')}</span>
          <span className="sym-count">{confirmed.length}</span>
        </div>
        {confirmed.length ? (
          <div className="sym-grid">
            {confirmed.map(({ s, state, source }) => (
              <div key={s.key} className={'sym-row set' + (isDangerSymptom(s) ? ' danger' : '')}>
                <span className="sym-name">
                  {nameOf(s)}
                  <small className="sym-src">{translate(SOURCE_LABEL[source] ?? SOURCE_LABEL.Form)}</small>
                </span>
                <span className="sym-row-actions">
                  <StateButtons cur={state} disabled={disabled} states={STATES.filter((x) => x.key !== 'UNKNOWN')} onPick={(next) => next !== state && onSet(s.key, next)} />
                  <button type="button" className="icon-btn sym-rm" disabled={disabled} onClick={() => onSet(s.key, 'UNKNOWN')} title={translate('Remove')} aria-label={translate('Remove')}>
                    <Icon name="x" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="ai-soft sym-empty">{translate('Nothing confirmed yet — confirm the suggestions above or pick below.')}</p>
        )}
      </div>

      {groups.map((g) => {
        const picked = g.items.filter((s) => value[s.key] && value[s.key].state !== 'UNKNOWN').length
        const isOpen = !g.label || (openGroups[g.key] ?? g.key === DANGER)
        return (
          <div key={g.key} className={'sym-section' + (g.label ? ' grouped' : '') + (g.key === DANGER ? ' danger' : '')}>
            {g.label && (
              <button type="button" className="sym-group" aria-expanded={isOpen} onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !isOpen }))}>
                <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} />
                <span>{translate(g.label)}</span>
                {picked > 0 && <span className="sym-picked">{translate(`${picked} selected`)}</span>}
                <span className="sym-count">{g.items.length}</span>
              </button>
            )}
            {isOpen && (
              <div className="sym-grid">
                {g.items.map((s) => (
                  <Row key={s.key} s={s} value={value} onSet={onSet} disabled={disabled} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
