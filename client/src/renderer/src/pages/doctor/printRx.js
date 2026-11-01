import { translate } from '../../i18n'
import { findDrugByName } from '../../api/inventoryStore'
import { controlledKind, CONTROLLED_LABEL, soldOutside } from '../../api/rxSafety'
import { unitLabel, printHtml, esc } from '../admin/inventory/shared'
import { dmy } from '../reception/shared'

// Thuốc thường trên đơn chính; thuốc gây nghiện (N) / hướng thần (H) mỗi loại một đơn riêng (trang riêng),
// có thêm dòng địa chỉ / CCCD để điền tay.
export function printPrescription(rx, drugs, doctorName) {
  const t = translate
  const kindOf = (l) => controlledKind(findDrugByName(l.name, drugs))
  const rowsOf = (lines) =>
    lines
      .map((l, i) => {
        const drug = findDrugByName(l.name, drugs)
        return `<tr><td>${i + 1}</td><td><b>${esc(l.name)}</b>${drug?.ingredient ? ` <small>(${esc(drug.ingredient)})</small>` : ''}<br><small>${esc(t(l.usage ?? ''))}</small></td><td class="num">${esc(l.qty)} ${esc(t(unitLabel(l.unit)))}</td></tr>`
      })
      .join('')
  const extraDx = rx.diagnosesExtra ?? []
  const page = (title, lines, extra = '') => `<h1>${esc(title)}</h1>
      <p class="meta">${esc(t('Patient'))}: <b>${esc(rx.name)}</b> · ${esc(t(rx.gender ?? ''))}${rx.age !== '' && rx.age != null ? ', ' + rx.age + ' ' + esc(t('yrs')) : ''} · ${esc(rx.patientId ?? '')}${rx.phone ? ' · ' + esc(rx.phone) : ''}</p>
      ${extra}
      ${rx.weight ? `<p class="meta">${esc(t('Weight (kg)'))}: ${esc(rx.weight)}</p>` : ''}
      ${rx.allergies ? `<p class="meta">${esc(t('Drug allergy'))}: <b>${esc(t(rx.allergies))}</b></p>` : ''}
      <p class="meta">${esc(t('Diagnosis'))}: ${esc(rx.diagnosis || '—')}</p>
      ${extraDx.length ? `<p class="meta">${esc(t('Secondary diagnoses'))}: ${esc(extraDx.join('; '))}</p>` : ''}
      <table><thead><tr><th>#</th><th>${esc(t('Drug'))}</th><th class="num">${esc(t('Quantity'))}</th></tr></thead><tbody>${rowsOf(lines)}</tbody></table>
      ${rx.plan ? `<p class="meta">${esc(t('Advice'))}: ${esc(rx.plan)}</p>` : ''}
      ${rx.followUp ? `<p class="meta"><b>${esc(t('Follow-up visit'))}: ${esc(dmy(rx.followUp + 'T12:00:00'))}</b></p>` : ''}
      <p class="meta" style="margin-top:18px;text-align:right">${esc(dmy(rx.rxAt ?? new Date().toISOString()))}<br>${esc(t('Prescribing doctor'))}<br><small>${esc(t('(signature, full name)'))}</small><br><br><b>${esc(doctorName ?? '')}</b></p>`
  const blank = `<p class="meta">${esc(t('Address'))}: ......................................................................</p>
      <p class="meta">${esc(t('ID card no. (CCCD)'))}: ..................................... ${esc(t('Guardian (for children)'))}: ..................................</p>`
  const lines = rx.rx ?? []
  const normal = lines.filter((l) => !kindOf(l))
  const pages = [
    ...(normal.length ? [page(t('Prescription'), normal)] : []),
    ...['N', 'H']
      .map((k) => [k, lines.filter((l) => kindOf(l) === k)])
      .filter(([, ls]) => ls.length)
      .map(([k, ls]) =>
        page(
          t('Prescription') + ' “' + k + '” — ' + t(CONTROLLED_LABEL[k]),
          ls,
          blank + (soldOutside(findDrugByName(ls[0].name, drugs)) ? `<p class="meta"><b>${esc(t('Buy at a pharmacy licensed to sell controlled drugs.'))}</b></p>` : '')
        )
      )
  ]
  printHtml(t('Prescription'), pages.join('<div style="page-break-before:always"></div>'), 'prescription')
}
