import { useState } from 'react'
import SearchModal from '../components/SearchModal'
import IntakeModal from '../components/IntakeModal'
import RedFlagModal from '../components/RedFlagModal'
import { LoadingBlock, ErrorBlock } from '../components/DataState'
import { useApiData } from '../hooks/useApiData'
import { useToast } from '../context/ToastContext'
import Icon from '../components/Icon'

export default function Schedule() {
  const { showToast } = useToast()
  const { data: days, loading: l1, error: e1 } = useApiData('/schedule/days')
  const { data: slots, loading: l2, error: e2 } = useApiData('/schedule/slots')
  const loading = l1 || l2
  const error = e1 || e2

  const [activeDay, setActiveDay] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [redFlag, setRedFlag] = useState(null) // bệnh nhân đang được cảnh báo dấu hiệu nguy hiểm

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Schedule</h1>
          <p>Manage daily appointments and check in arriving patients</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setSearchOpen(true)}>
            <Icon name="search" /> Search patients / appointments
          </button>
          <button className="btn btn-primary" onClick={() => setIntakeOpen(true)}>
            + New appointment
          </button>
        </div>
      </div>

      {loading && <LoadingBlock text="Loading schedule..." />}
      {error && <ErrorBlock message={error} />}

      {days && slots && (
        <>
          <div className="schedule-toolbar">
            <div className="schedule-days">
              {days.map((d, i) => (
                <button
                  key={d}
                  className={'schedule-day' + (activeDay === i ? ' active' : '')}
                  onClick={() => setActiveDay(i)}
                >
                  {d}
                </button>
              ))}
            </div>
            <span
              className="cnt"
              style={{
                fontFamily: "'IBM Plex Mono'",
                fontSize: 12,
                color: 'var(--ink-soft)',
                background: 'var(--surface-alt)',
                padding: '5px 11px',
                borderRadius: 20
              }}
            >
              {slots.length} appointments today
            </span>
          </div>
          <div className="card">
            {slots.map((s) => (
              <div className="schedule-slot" key={s.time + s.name}>
                <div className="tm">{s.time}</div>
                <div className="ev">
                  <div
                    className={'schedule-chip' + (s.late ? ' late' : '')}
                    onClick={() => showToast(s.late ? `Checked in late — ${s.name}` : `Checked in — ${s.name}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <b>{s.name}</b>
                    <span>{s.note}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <IntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} onRedFlag={setRedFlag} />
      <RedFlagModal open={!!redFlag} patient={redFlag} onClose={() => setRedFlag(null)} onReferred={() => setIntakeOpen(false)} />
    </div>
  )
}
