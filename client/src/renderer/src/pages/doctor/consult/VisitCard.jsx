import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { ST, leftReasonLabel } from '../../../api/queueStore'
import { dmy } from '../../reception/shared'
import { vitalsText } from '../../../api/vitals'
import { LabOrderResults } from '../doctorShared'

export function VisitCard({ v, onReuse }) {
  const left = v.outcome === 'left' || v.status === ST.CANCELLED || v.status === 'left'
  const notes = v.draftNotes
  return (
    <div className="tl-item">
      <div className="tl-head">
        <b className="mono">{dmy(v.rxAt ?? v.statusAt ?? v.arrivedAt)}</b>
        <span>· {v.doctor || '—'}</span>
        {left && <span className="badge muted">{translate('Unfinished visit')}</span>}
        <span className="tl-dx">
          {v.diagnosis || translate(v.reason ?? '') || '—'}
          {v.diagnosesExtra?.length > 0 && <span className="ai-soft"> · {v.diagnosesExtra.join('; ')}</span>}
        </span>
      </div>
      {left && v.left && (
        <div className="tl-row ai-soft">
          {translate(leftReasonLabel(v.left.reason))}
          {v.left.note ? ' — ' + v.left.note : ''}
        </div>
      )}
      {(v.hpi || notes?.hpi) && (
        <div className="tl-row">
          <small>{translate('History')}</small> {v.hpi || notes.hpi}
        </div>
      )}
      {v.vitals && (
        <div className="tl-row ai-soft mono">
          {vitalsText(v.vitals)}
        </div>
      )}
      {v.exam && (
        <div className="tl-row">
          <small>{translate('Examination')}</small> {v.exam}
        </div>
      )}
      {v.plan && (
        <div className="tl-row">
          <small>{translate('Plan')}</small> {v.plan}
        </div>
      )}
      {left && notes?.exam && (
        <div className="tl-row">
          <small>{translate('Unsaved notes')}</small> {notes.exam}
        </div>
      )}
      {v.labOrders?.map((o, i) => (
        <LabOrderResults key={o.id} order={o} summary={i === v.labOrders.length - 1 ? v.labResult : ''} />
      ))}
      {v.rx?.length > 0 && (
        <div className="tl-rx">
          <span className="ai-soft">{v.rx.map((x) => `${x.name} × ${x.qty}`).join(', ')}</span>
          {onReuse && (
            <button className="btn btn-ghost btn-sm" onClick={() => onReuse(v.rx)}>
              <Icon name="repeat" /> Reuse
            </button>
          )}
        </div>
      )}
      {v.followUp && (
        <div className="tl-row ai-soft">
          <Icon name="calendar" /> {translate('Follow-up visit')}: {dmy(v.followUp + 'T12:00:00')}
        </div>
      )}
    </div>
  )
}
