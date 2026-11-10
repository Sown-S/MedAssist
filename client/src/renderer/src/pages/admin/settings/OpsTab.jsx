import { PAYMENT_METHODS } from '../../../api/settingsStore'
import { fmtMoney } from '../inventory/shared'
import { Field } from './Field'

// Tab “Vận hành”: ngưỡng kho, cảnh báo cụm ca, phí khám và phương thức thanh toán. form = { fp, num, val, set } của SettingsPage.
export function OpsTab({ form }) {
  const { fp, num, val, set } = form
  return (
    <div className="card">
      <div className="section-label" style={{ marginTop: 0 }}>
        Inventory
      </div>
      <div className="set-grid">
        <Field {...fp('ops.nearDays')} hint="Batches expiring within this period are flagged on Home and in Stock & expiry.">
          <div className="ai-seg">
            {[30, 60, 90].map((n) => (
              <button key={n} type="button" className={val('ops.nearDays') === n ? 'active' : ''} onClick={() => set('ops.nearDays', n)}>
                {n} <span>days</span>
              </button>
            ))}
          </div>
        </Field>
        <Field {...fp('ops.shelfBufferDays')} hint="When a prescription is confirmed, only batches that stay valid until today + the course length (or this many days, whichever is longer) are used.">
          <input {...num('ops.shelfBufferDays')} min="0" max="365" />
        </Field>
        <Field {...fp('ops.defaultThreshold')} hint="Pre-filled when a new drug is added; each drug can still have its own threshold.">
          <input {...num('ops.defaultThreshold')} min="0" />
        </Field>
      </div>

      <div className="section-label">Case cluster alerts</div>
      <div className="set-grid">
        <Field {...fp('ops.clusterDays')} hint="Physicians and administrators see a warning on their dashboard when a diagnosis or confirmed symptom clusters in this many recent days.">
          <input {...num('ops.clusterDays')} min="1" max="30" />
        </Field>
        <Field {...fp('ops.clusterMinCases')} hint="Fewer cases than this never raise an alert.">
          <input {...num('ops.clusterMinCases')} min="2" max="1000" />
        </Field>
        <Field {...fp('ops.clusterRatio')} hint="The count must be at least this many times the average of the previous periods of the same length.">
          <input {...num('ops.clusterRatio')} min="1" max="10" step="0.1" />
        </Field>
      </div>

      <div className="section-label">Payments</div>
      <div className="set-grid">
        <Field {...fp('ops.consultFee')} hint={fmtMoney(Number(val('ops.consultFee')) || 0)}>
          <input {...num('ops.consultFee')} min="0" step="1000" />
        </Field>
        <Field {...fp('ops.methods')} wide>
          <div className="set-checks">
            {PAYMENT_METHODS.map((m) => {
              const on = val('ops.methods').includes(m.key)
              return (
                <label key={m.key}>
                  <input type="checkbox" checked={on} onChange={() => set('ops.methods', on ? val('ops.methods').filter((x) => x !== m.key) : [...val('ops.methods'), m.key])} />{' '}
                  <span>{m.label}</span>
                </label>
              )
            })}
          </div>
        </Field>
      </div>
    </div>
  )
}
