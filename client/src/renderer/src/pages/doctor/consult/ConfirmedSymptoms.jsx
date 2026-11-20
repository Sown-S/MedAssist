import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { SOURCES, useSymptomCatalog, isExamSign, displayName, fullNameTitle } from '../../../api/symptoms'

// Triệu chứng bệnh nhân kể lúc tiếp đón (dấu hiệu khi khám nằm ở phần O). Tên ngắn theo danh mục, rê chuột xem tên đầy
// đủ; mã không còn trong danh mục thì dùng symptom_name server trả kèm. Nguồn hiện trong tooltip.
export function ConfirmedSymptoms({ list }) {
  const catalog = useSymptomCatalog()
  const byKey = new Map(catalog.list.map((s) => [s.key, s]))
  const reported = (list ?? []).filter((x) => !isExamSign(byKey.get(x.symptom_code)))
  if (!reported.length) return null
  const yes = reported.filter((x) => x.state === 'PRESENT')
  const no = reported.filter((x) => x.state === 'ABSENT')
  const tag = (x) => {
    const s = byKey.get(x.symptom_code)
    const full = fullNameTitle(s)
    const src = translate(SOURCES[x.source] ?? '')
    return (
      <span key={x.symptom_code} className={'chip ' + (x.state === 'PRESENT' ? 'yes' : 'no')} title={full ? `${full} · ${src}` : src}>
        <Icon name={x.state === 'PRESENT' ? 'check' : 'x'} />
        {s ? translate(displayName(s)) : x.symptom_name || x.symptom_code}
      </span>
    )
  }
  return (
    <div className="chips mt-8">
      {yes.map(tag)}
      {no.map(tag)}
    </div>
  )
}
