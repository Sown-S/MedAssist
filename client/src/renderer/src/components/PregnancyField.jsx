import Icon from './Icon'
import { translate } from '../i18n'

const OPTIONS = [
  ['', 'Not asked'],
  ['no', 'Not pregnant'],
  ['yes', 'Pregnant']
]

// Tình trạng thai của lượt khám này (hỏi nữ / giới tính khác 12–55 tuổi): '' chưa hỏi | 'no' | 'yes'.
export default function PregnancyField({ value, onChange }) {
  return (
    <>
      <div className="sec-t">
        <Icon name="baby" />
        <span>Pregnancy</span>
      </div>
      <div className="seg" role="radiogroup" aria-label={translate('Pregnancy')}>
        {OPTIONS.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {translate(l)}
          </button>
        ))}
      </div>
    </>
  )
}
