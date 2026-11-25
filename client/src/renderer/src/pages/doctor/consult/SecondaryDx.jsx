import { useState } from 'react'
import ICDPicker, { SexWarning } from '../../../components/ICDPicker'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'

export function SecondaryDx({ list, onChange, gender }) {
  const [text, setText] = useState('')
  const add = (v) => {
    const x = v.trim()
    if (x && !list.includes(x)) onChange([...list, x])
    setText('')
  }
  return (
    <>
      {list.length > 0 && (
        <div className="dx-tags mb-6">
          {list.map((x) => (
            <span key={x} className="dx-tag sec">
              {x}
              <button title={translate('Remove')} aria-label={translate('Remove')} onClick={() => onChange(list.filter((y) => y !== x))}>
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
      )}
      {list.map((x) => (
        <SexWarning key={x} text={x} gender={gender} label />
      ))}
      <div className="d-flex gap-8 items-start">
        <div className="grow">
          <ICDPicker value={text} gender={gender} onChange={setText} onPick={add} />
        </div>
        <button className="btn btn-ghost btn-sm mt-4" disabled={!text.trim()} onClick={() => add(text)}>
          <Icon name="plus" />
          {translate('Add')}
        </button>
      </div>
    </>
  )
}
