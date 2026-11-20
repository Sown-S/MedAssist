// Phiếu số thứ tự và biên lai; khổ giấy theo mục “Hoá đơn” ở Cài đặt › In ấn (mặc định máy in nhiệt 80 mm).
import { printHtml, esc } from '../pages/admin/inventory/shared'
import { PAYMENT_METHODS } from '../api/settingsStore'
import { translate } from '../i18n'
import { money, fmtDateTime } from '../utils/format'

const t = translate
export const ticketNo = (n) => String(n).padStart(3, '0')

export function printTicket(v) {
  printHtml(
    t('Queue ticket') + ' ' + ticketNo(v.ticket),
    `<div class="ticket">
      <div class="lab">${esc(t('Queue ticket'))}</div>
      <div class="no">${ticketNo(v.ticket)}</div>
      ${v.priority ? `<span class="pri">${esc(t('Priority'))}</span>` : ''}
      <div class="nm">${esc(v.name)}</div>
      <div class="meta">${esc(fmtDateTime(v.arrivedAt))}</div>
      <div class="hint">${esc(t('Please wait until your number is called.'))}</div>
    </div>`,
    'invoice'
  )
}

export function printReceipt(inv) {
  const method = PAYMENT_METHODS.find((m) => m.key === inv.method)?.label ?? inv.method
  const rows = inv.items.map((it) => `<tr><td>${esc(t(it.name))}${it.qty > 1 ? ' × ' + it.qty : ''}</td><td class="num">${money(it.amount)}</td></tr>`).join('')
  printHtml(
    t('Payment receipt') + ' ' + inv.id,
    `<h1>${esc(t('Payment receipt'))} ${esc(inv.id)}</h1>
    <p class="meta">${esc(t('Patient'))}: <b>${esc(inv.name)}</b>${inv.ticket ? ' · ' + esc(t('Queue no.')) + ' ' + ticketNo(inv.ticket) : ''}</p>
    <p class="meta">${esc(t('Paid at'))}: ${esc(fmtDateTime(inv.paidAt ?? inv.createdAt))}</p>
    <table><thead><tr><th>${esc(t('Line item'))}</th><th class="num">${esc(t('Amount'))}</th></tr></thead><tbody>${rows}
      <tr class="total"><td>${esc(t('Amount paid'))}</td><td class="num">${money(inv.total)}</td></tr>
      <tr><td>${esc(t('Payment method'))}</td><td class="num">${esc(t(method))}${inv.ref ? ' · ' + esc(inv.ref) : ''}</td></tr>
    </tbody></table>
    <p class="meta">${esc(t('Collected by'))}: ${esc(inv.byName)}</p>`,
    'invoice'
  )
}
