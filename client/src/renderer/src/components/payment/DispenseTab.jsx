import { useState } from 'react'
import Icon from '../Icon'
import { useToast } from '../../context/ToastContext'
import { dispenseItem, dispenseAll } from '../../api/billingApi'
import { unitLabel, printHtml, esc } from '../../pages/admin/inventory/shared'
import { translate } from '../../i18n'
import { fmtDateTime } from '../../utils/format'

const DS = {
  Pending: { label: 'Waiting to dispense', cls: 'b-warning' },
  Dispensed: { label: 'Dispensed', cls: 'b-success' },
  Skipped: { label: 'Skipped', cls: 'b-neutral' }
}

// Tab "Cấp phát": từng dòng thuốc đã cấp / bỏ qua (kèm lý do, hoàn kho), cấp tất cả, in phiếu cấp phát.
export default function DispenseTab({ active, visitId, items, waiting, paid, rx, patient, ticket, user, act }) {
  const { showToast } = useToast()
  const [skipping, setSkipping] = useState(null)
  const [skipReason, setSkipReason] = useState('')

  const markDispensed = (l) => act(() => dispenseItem(l.item_id, 'Dispensed'))
  async function confirmSkip() {
    const r = await act(() => dispenseItem(skipping, 'Skipped', skipReason.trim()), 'Skipped — stock returned and the invoice re-issued')
    if (r) {
      setSkipping(null)
      setSkipReason('')
    }
  }
  const all = () => act(() => dispenseAll(visitId), 'All drugs recorded as dispensed')

  function printSlip() {
    const t = translate
    const rows = items
      .filter((l) => l.dispense_status !== 'Skipped')
      .map(
        (l, n) =>
          `<tr><td>${n + 1}</td><td><b>${esc(l.drug_name)}</b><br><small>${esc([l.dosage, l.frequency, l.duration_days + ' ngày'].join(' · '))}</small></td><td class="num">${esc(l.quantity)} ${esc(t(unitLabel(l.unit)))}</td></tr>`
      )
      .join('')
    if (!rows) return showToast(translate('No drugs to dispense on this invoice.'), 'error')
    printHtml(
      t('Dispensing slip'),
      `<h1>${esc(t('Dispensing slip'))}</h1>
      <p class="meta">${esc(t('Patient'))}: <b>${esc(patient.name)}</b>${ticket ? ' · ' + esc(t('no.')) + ' ' + esc(ticket) : ''}</p>
      <p class="meta">${fmtDateTime(new Date())} · ${esc(user.name)}</p>
      ${rx?.patient_context?.allergy_notes ? `<p class="meta">${esc(t('Drug allergy'))}: <b>${esc(rx.patient_context.allergy_notes)}</b></p>` : ''}
      ${rx?.patient_context?.is_pregnant === true ? `<p class="meta"><b>${esc(t('Pregnant'))}</b></p>` : ''}
      <table><thead><tr><th>#</th><th>${esc(t('Drug'))}</th><th class="num">${esc(t('Quantity'))}</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sign"><div>${esc(t('Dispensed by'))}<i>(${esc(t('Signature, full name'))})</i></div><div></div><div>${esc(t('Patient received'))}<i>(${esc(t('Signature, full name'))})</i></div></div>`,
      'other'
    )
  }

  return (
    <div className={'panel' + (active ? ' on' : '')}>
      {rx?.patient_context?.allergy_notes !== undefined && (
        <div className="alerts mb-10">
          {rx.patient_context.is_pregnant === true && (
            <span className="badge b-warning">
              <Icon name="baby" />
              {translate('Pregnant')}
            </span>
          )}
          {rx.patient_context.allergy_notes ? (
            <span className="allergy">
              <Icon name="triangle-alert" />
              {translate('Drug allergy')}: {rx.patient_context.allergy_notes}
            </span>
          ) : (
            <span className="muted">
              {translate('Drug allergy')}: {translate('none recorded')}
            </span>
          )}
        </div>
      )}
      {items.length ? (
        <div className="tbl-wrap" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Drug</th>
                <th className="r num">Quantity</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.item_id} className={l.dispense_status === 'Skipped' ? 'dim' : ''}>
                  <td>
                    <b className="fw-500">{l.drug_name}</b>
                    <div className="muted small">{[l.dosage, l.frequency, l.duration_days + ' ' + translate('days')].join(' · ')}</div>
                    {l.instruction && <div className="muted small">{l.instruction}</div>}
                    {l.skip_reason && (
                      <div className="muted small">
                        {translate('Reason')}: {l.skip_reason}
                      </div>
                    )}
                  </td>
                  <td className="r num">
                    {l.quantity} {translate(unitLabel(l.unit))}
                  </td>
                  <td>
                    <span className={'badge ' + (DS[l.dispense_status]?.cls ?? 'b-neutral')}>{translate(DS[l.dispense_status]?.label ?? l.dispense_status)}</span>
                  </td>
                  <td>
                    <div className="acts">
                      {l.dispense_status === 'Pending' && skipping !== l.item_id && (
                        <>
                          <button className="btn btn-outline btn-sm" onClick={() => markDispensed(l)}>
                            {translate('Dispensed')}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={paid}
                            title={paid ? translate('Already paid — only “Dispensed” can be recorded now') : ''}
                            onClick={() => (setSkipping(l.item_id), setSkipReason(''))}
                          >
                            {translate('Skip')}
                          </button>
                        </>
                      )}
                      {skipping === l.item_id && (
                        <span className="toolbar justify-end">
                          <input
                            className="input"
                            type="text"
                            autoFocus
                            placeholder={translate('Reason (e.g. patient declined, out of stock)')}
                            value={skipReason}
                            onChange={(e) => setSkipReason(e.target.value)}
                          />
                          <button className="btn btn-danger btn-sm" disabled={skipReason.trim().length < 3} onClick={confirmSkip}>
                            Skip &amp; return stock
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSkipping(null)}>
                            Cancel
                          </button>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">{translate('No medication to dispense for this visit.')}</p>
      )}
      <p className="muted small mt-10">
        <span>
          Stock was already deducted (FEFO) when the doctor confirmed the prescription. “Dispensed” does not deduct again; “Skip” returns the stock to the same batches and re-issues the invoice.
        </span>
      </p>
      <div className="d-flex gap-8 justify-end mt-12">
        <button className="btn btn-outline btn-sm" onClick={printSlip}>
          <Icon name="printer" />
          {translate('Print dispensing slip')}
        </button>
        {waiting.length > 0 && (
          <button className="btn btn-outline btn-sm" onClick={all}>
            <Icon name="check-check" />
            {translate('Dispense all')}
          </button>
        )}
      </div>
    </div>
  )
}
