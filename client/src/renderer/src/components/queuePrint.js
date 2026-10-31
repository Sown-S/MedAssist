// Phiếu số thứ tự và biên lai; khổ giấy theo mục “Hoá đơn” ở Cài đặt › In ấn (mặc định máy in nhiệt 80 mm).
import { printHtml, esc } from '../pages/admin/inventory/shared'
import { PAYMENT_METHODS } from '../api/settingsStore'
import { translate } from '../i18n'

const t = translate
const fmt = (n) => ((Number(n) || 0) < 0 ? '-' : '') + Math.abs(Number(n) || 0).toLocaleString('vi-VN') + 'đ'
const when = (iso) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false })
export const ticketNo = (n) => String(n).padStart(3, '0')

export function printTicket(v) {
  printHtml(
    t('Queue ticket') + ' ' + ticketNo(v.ticket),
    `<div style="text-align:center">
      <p class="meta">${esc(t('Queue ticket'))}</p>
      <div style="font-size:44px;font-weight:700;line-height:1.1">${ticketNo(v.ticket)}</div>
      ${v.priority ? `<p class="meta"><b>${esc(t('Priority'))}</b></p>` : ''}
      <p class="meta"><b>${esc(v.name)}</b></p>
      <p class="meta">${esc(when(v.arrivedAt))}</p>
      <p class="meta">${esc(t('Please wait until your number is called.'))}</p>
    </div>`,
    'invoice'
  )
}

export function printReceipt(inv) {
  const method = PAYMENT_METHODS.find((m) => m.key === inv.method)?.label ?? inv.method
  const rows = inv.items.map((it) => `<tr><td>${esc(t(it.name))}${it.qty > 1 ? ' × ' + it.qty : ''}</td><td class="num">${fmt(it.amount)}</td></tr>`).join('')
  printHtml(
    t('Payment receipt') + ' ' + inv.id,
    `<h1>${esc(t('Payment receipt'))} ${esc(inv.id)}</h1>
    <p class="meta">${esc(t('Patient'))}: <b>${esc(inv.name)}</b>${inv.ticket ? ' · ' + esc(t('Queue no.')) + ' ' + ticketNo(inv.ticket) : ''}</p>
    <p class="meta">${esc(t('Paid at'))}: ${esc(when(inv.paidAt ?? inv.createdAt))}</p>
    <table><tbody>${rows}
      <tr><td><b>${esc(t('Amount paid'))}</b></td><td class="num"><b>${fmt(inv.total)}</b></td></tr>
      <tr><td>${esc(t('Payment method'))}</td><td class="num">${esc(t(method))}${inv.ref ? ' · ' + esc(inv.ref) : ''}</td></tr>
    </tbody></table>
    <p class="meta">${esc(t('Collected by'))}: ${esc(inv.byName)}</p>`,
    'invoice'
  )
}
