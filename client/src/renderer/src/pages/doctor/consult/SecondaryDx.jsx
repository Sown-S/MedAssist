import { useState } from 'react'
import ICDPicker from '../../../components/ICDPicker'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { ICD10 } from '../../admin/ai/catalog'

// Chẩn đoán phụ / bệnh kèm: chọn từ ICD-10 (chọn xong tự thêm vào danh sách) hoặc gõ rồi bấm Thêm.
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
          <ICDPicker value={text} onChange={(v) => (ICD10.some((o) => v.startsWith(o.code + ' — ')) ? add(v) : setText(v))} />
        </div>
        <button className="btn btn-ghost btn-sm" disabled={!text.trim()} onClick={() => add(text)}>
          + Add
        </button>
      </div>
    </div>
  )
}
