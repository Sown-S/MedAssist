import { translate } from '../../../i18n'
import { SOURCES } from '../../../api/symptoms'
import { symptomName } from '../../../api/symptoms'

// Kèm nguồn nếu không phải nhập tay.
export function ConfirmedSymptoms({ list }) {
  if (!list?.length) return null
  const yes = list.filter((x) => x.state === 'PRESENT')
  const no = list.filter((x) => x.state === 'ABSENT')
  const tag = (x) => (
    <span key={x.symptom_code} className={'sym-chip ' + x.state.toLowerCase()} title={translate(SOURCES[x.source] ?? '')}>
      <span className="sym-chip-state">{translate(x.state === 'PRESENT' ? 'Yes' : 'No')}</span>
      <span style={{ paddingRight: 6 }}>{translate(symptomName(x.symptom_code))}</span>
    </span>
  )
  return (
    <div className="sym-chips" style={{ marginTop: 6 }}>
      {yes.map(tag)}
      {no.map(tag)}
    </div>
  )
}
