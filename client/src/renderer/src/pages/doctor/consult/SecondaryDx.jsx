import { useState } from 'react'
import ICDPicker from '../../../components/ICDPicker'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'

export function SecondaryDx({ list, onChange }) {
  const [text, setText] = useState('')
  const add = (v) => {
    const x = v.trim()
    if (x && !list.includes(x)) onChange([...list, x])
    setText('')
  }
  return (
    <div className="dx2">
      <div className="section-label">Secondary diagnoses / comorbidities</div>
      {list.length > 0 && (
        <div className="dx2-list">
          {list.map((x) => (
            <span key={x} className="dx2-chip">
              {x}
              <button title={translate('Remove')} onClick={() => onChange(list.filter((y) => y !== x))}>
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="dx2-add">
        <div style={{ flex: 1 }}>
          <ICDPicker value={text} onChange={setText} onPick={add} />
        </div>
        <button className="btn btn-ghost btn-sm" disabled={!text.trim()} onClick={() => add(text)}>
          + Add
        </button>
      </div>
    </div>
  )
}
