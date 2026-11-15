import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { SOURCES, symptomName } from '../../../api/symptoms'

// Kèm nguồn nếu không phải nhập tay. Tên lấy từ symptom_name server trả kèm (màn bác sĩ không nạp danh mục triệu chứng).
export function ConfirmedSymptoms({ list }) {
  if (!list?.length) return null
  const yes = list.filter((x) => x.state === 'PRESENT')
  const no = list.filter((x) => x.state === 'ABSENT')
  const tag = (x) => (
    <span key={x.symptom_code} className={'chip ' + (x.state === 'PRESENT' ? 'yes' : 'no')} title={translate(SOURCES[x.source] ?? '')}>
      <Icon name={x.state === 'PRESENT' ? 'check' : 'x'} />
      {x.symptom_name || translate(symptomName(x.symptom_code))}
    </span>
  )
  return (
    <div className="chips" style={{ marginTop: 8 }}>
      {yes.map(tag)}
      {no.map(tag)}
    </div>
  )
}
