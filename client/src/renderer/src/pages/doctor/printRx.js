import { translate } from '../../i18n'
import { findDrugByName } from '../../api/inventoryStore'
import { unitLabel, printHtml, esc } from '../admin/inventory/shared'
import { dmy } from '../reception/shared'

// Danh mục thuốc của phòng khám chỉ có thuốc thường nên mọi dòng in trên một đơn.
export function printPrescription(rx, drugs, doctorName) {
  const t = translate
  const rowsOf = (lines) =>
    lines
      .map((l, i) => {
        const drug = findDrugByName(l.name, drugs)
        return `<tr><td>${i + 1}</td><td><b>${esc(l.name)}</b>${drug?.ingredient ? ` <small>(${esc(drug.ingredient)})</small>` : ''}<br><small>${esc(t(l.usage ?? ''))}</small></td><td class="num">${esc(l.qty)} ${esc(t(unitLabel(l.unit)))}</td></tr>`
      })
      .join('')
  const extraDx = rx.diagnosesExtra ?? []
  const page = (title, lines) => `<h1>${esc(title)}</h1>
      <p class="meta">${esc(t('Patient'))}: <b>${esc(rx.name)}</b> · ${esc(t(rx.gender ?? ''))}${rx.age !== '' && rx.age != null ? ', ' + rx.age + ' ' + esc(t('yrs')) : ''} · ${esc(rx.patientId ?? '')}${rx.phone ? ' · ' + esc(rx.phone) : ''}</p>
      ${rx.weight ? `<p class="meta">${esc(t('Weight (kg)'))}: ${esc(rx.weight)}</p>` : ''}
      ${rx.allergies ? `<p class="meta">${esc(t('Drug allergy'))}: <b>${esc(t(rx.allergies))}</b></p>` : ''}
      <p class="meta">${esc(t('Diagnosis'))}: ${esc(rx.diagnosis || '—')}</p>
      ${extraDx.length ? `<p class="meta">${esc(t('Secondary diagnoses'))}: ${esc(extraDx.join('; '))}</p>` : ''}
      <table><thead><tr><th>#</th><th>${esc(t('Drug'))}</th><th class="num">${esc(t('Quantity'))}</th></tr></thead><tbody>${rowsOf(lines)}</tbody></table>
      ${rx.plan ? `<p class="meta">${esc(t('Advice'))}: ${esc(rx.plan)}</p>` : ''}
      ${rx.followUp ? `<p class="meta"><b>${esc(t('Follow-up visit'))}: ${esc(dmy(rx.followUp + 'T12:00:00'))}</b></p>` : ''}
      <p class="meta" style="margin-top:18px;text-align:right">${esc(dmy(rx.rxAt ?? new Date().toISOString()))}<br>${esc(t('Prescribing doctor'))}<br><small>${esc(t('(signature, full name)'))}</small><br><br><b>${esc(doctorName ?? '')}</b></p>`
  const lines = rx.rx ?? []
  printHtml(t('Prescription'), lines.length ? page(t('Prescription'), lines) : '', 'prescription')
}
