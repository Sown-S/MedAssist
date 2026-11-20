import { useState } from 'react'
import { translate } from '../../../i18n'
import { getSettings, PAPERS } from '../../../api/settingsStore'
import { getDevice } from '../../../api/deviceSettings'
import { money } from '../../../utils/format'

const UNITS = [
  { key: 'tablet', label: 'Tablet' },
  { key: 'capsule', label: 'Capsule' },
  { key: 'sachet', label: 'Sachet' },
  { key: 'tube', label: 'Tube' },
  { key: 'bottle', label: 'Bottle' },
  { key: 'ampoule', label: 'Ampoule' },
  { key: 'box', label: 'Box' },
  { key: 'pack', label: 'Pack' }
]
export const unitLabel = (k) => UNITS.find((u) => u.key === k)?.label ?? k

export const STATUS = {
  ok: { label: 'Sufficient', cls: 'b-success' },
  low: { label: 'Low stock', cls: 'b-warning' },
  out: { label: 'Out of stock', cls: 'b-danger' },
  near: { label: 'Near expiry', cls: 'b-warning' },
  expired: { label: 'Has expired batches', cls: 'b-danger' },
  inactive: { label: 'Discontinued', cls: 'b-neutral' }
}

export const MOVE_TYPES = {
  in: 'Stock in',
  out: 'Stock out',
  return: 'Returned to stock'
}

// Giá chưa có (không phải số) hiện '—' thay vì 0đ.
export const fmtMoney = (n) => (Number.isFinite(n) ? money(Math.round(n)) : '—')
export const fmtNum = (n) => (Number.isFinite(n) ? n.toLocaleString('vi-VN') : '—')
export function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
export function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function StatusBadges({ statuses }) {
  return (
    <div className="inv-status">
      {statuses.map((s) => (
        <span key={s} className={'badge ' + STATUS[s].cls}>
          {STATUS[s].label}
        </span>
      ))}
    </div>
  )
}

export function ExpiryCell({ batch }) {
  if (!batch) return <span className="muted">—</span>
  const d = batch.days
  const cls = d < 0 ? 'inv-exp bad' : d <= 30 ? 'inv-exp bad' : d <= 90 ? 'inv-exp warn' : 'inv-exp'
  return (
    <span className={cls}>
      <span className="num">{fmtDate(batch.expiry)}</span>{' '}
      {d < 0 ? (
        <span className="small">(expired)</span>
      ) : d <= 90 ? (
        <span className="small">
          (<span className="num">{d}</span> <span>days left</span>)
        </span>
      ) : null}
    </span>
  )
}

// Có BOM UTF-8 để Excel mở đúng tiếng Việt; tiêu đề cột dịch theo ngôn ngữ đang chọn.
export function exportCsv(fileName, headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const text = [headers.map((h) => esc(translate(h))), ...rows.map((r) => r.map(esc))].map((r) => r.join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

const PAGER_WINDOW = 5
export function Pager({ page, pages, total, from, to, onPage }) {
  const [jump, setJump] = useState('')
  if (total === 0) return null
  const start = Math.max(1, Math.min(page - Math.floor(PAGER_WINDOW / 2) + 1, pages - PAGER_WINDOW + 1))
  const end = Math.min(pages, start + PAGER_WINDOW - 1)
  const btn = (n) => (
    <button key={n} className={page === n ? 'active' : ''} onClick={() => onPage(n)}>
      {n}
    </button>
  )
  function go(e) {
    e.preventDefault()
    const n = parseInt(jump, 10)
    if (n >= 1) onPage(Math.min(n, pages))
    setJump('')
  }
  return (
    <div className="pager">
      <span>
        <span className="num">
          {from}–{to}
        </span>{' '}
        <span>of</span> <span className="num">{total}</span>
      </span>
      <div className="pager-btns">
        <button disabled={page === 1} onClick={() => onPage(page - 1)}>
          ‹
        </button>
        {start > 1 && btn(1)}
        {start > 2 && <span className="pager-gap">…</span>}
        {Array.from({ length: end - start + 1 }, (_, i) => btn(start + i))}
        {end < pages - 1 && <span className="pager-gap">…</span>}
        {end < pages && btn(pages)}
        <button disabled={page === pages} onClick={() => onPage(page + 1)}>
          ›
        </button>
        {pages > PAGER_WINDOW && (
          <form className="pager-jump" onSubmit={go}>
            <span>Go to page</span>
            <input className="input" type="number" min="1" max={pages} value={jump} onChange={(e) => setJump(e.target.value)} />
            <button type="submit" disabled={!jump}>
              Select
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export function paginate(list, page, size) {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const p = Math.min(page, pages)
  return { rows: list.slice((p - 1) * size, p * size), page: p, pages, total: list.length, from: list.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, list.length) }
}

export function SortTh({ k, sort, onSort, children, className }) {
  const on = sort.key === k
  return (
    <th className={'inv-sort' + (on ? ' on' : '') + (className ? ' ' + className : '')} onClick={() => onSort(on && sort.dir === 'asc' ? { key: k, dir: 'desc' } : { key: k, dir: 'asc' })}>
      {children} <span className="inv-sort-ic">{on ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  )
}

export function printHeaderHtml(set = getSettings()) {
  const c = set.clinic
  const p = set.print
  const lines = [
    c.address,
    [c.phone && 'ĐT: ' + c.phone, c.email].filter(Boolean).join(' · '),
    [c.taxCode && 'MST: ' + c.taxCode, c.licenseNo && 'GPHĐ: ' + c.licenseNo].filter(Boolean).join(' · '),
    p.header
  ].filter(Boolean)
  return (
    '<div class="ph">' +
    (p.showLogo && c.logo ? '<img src="' + c.logo + '" alt="">' : '') +
    '<div><b>' + esc(c.name || 'Tên phòng khám — chưa nhập trong Cài đặt') + '</b>' +
    lines.map((l) => '<div>' + esc(l) + '</div>').join('') +
    '</div></div>'
  )
}
// Giấy in theo bản mẫu: chữ Be Vietnam Pro (lấy từ font đã nạp trong app), tiêu đề giữa trang, bảng viền mảnh,
// đầu bảng nền xám nhạt, khối ký tên. Chỉ dùng đen / xám để in đơn sắc vẫn rõ.
const PRINT_CSS =
  'body{font-family:"Be Vietnam Pro",Arial,sans-serif;font-size:12px;line-height:1.5;color:#1d2129;margin:0}' +
  'h1{font-size:17px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.04em;margin:6px 0 2px}' +
  'h1+.sub{text-align:center;color:#5b636e;margin:0 0 12px}' +
  'h2{font-size:13px;font-weight:600;margin:16px 0 6px}' +
  '.meta{margin:3px 0}.meta b{font-weight:600}' +
  'h1+.meta{margin-top:12px}' +
  'table{width:100%;border-collapse:collapse;margin:12px 0 8px;font-size:inherit}' +
  'th,td{border:1px solid #c5ccd3;padding:6px 8px;text-align:left;vertical-align:top}' +
  'th{background:#f0f2f5;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#3c434d}' +
  'td small{color:#5b636e}tbody tr.total td{background:#f6f7f9;font-weight:700}' +
  '.num{text-align:right;font-variant-numeric:tabular-nums}.blank{min-width:90px}' +
  '.sig{margin-top:22px;margin-left:auto;width:42%;text-align:center}.sig small{display:block;color:#5b636e;margin-bottom:46px}' +
  '.sign{display:flex;justify-content:space-between;margin-top:36px}' +
  '.sign div{text-align:center;width:30%;font-weight:600}.sign i{display:block;font-weight:400;font-size:11px;color:#5b636e;margin-top:50px}' +
  '.ph{display:flex;gap:12px;align-items:center;border-bottom:2px solid #1d2129;padding-bottom:8px;margin-bottom:10px;font-size:11px;color:#3c434d}' +
  '.ph img{max-height:52px;max-width:96px}.ph b{display:block;font-size:14px;color:#1d2129;text-transform:uppercase;letter-spacing:.02em}' +
  '.pf{margin-top:20px;border-top:1px dashed #8a929c;padding-top:6px;text-align:center;font-size:11px;font-style:italic;color:#5b636e}' +
  '.ticket{text-align:center;padding:6px 0}.ticket .lab{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#3c434d}' +
  '.ticket .no{font-size:56px;font-weight:800;line-height:1.05;letter-spacing:.02em;margin:4px 0}' +
  '.ticket .pri{display:inline-block;border:1.5px solid #1d2129;border-radius:999px;padding:1px 10px;font-weight:700;font-size:11px;text-transform:uppercase}' +
  '.ticket .nm{font-size:14px;font-weight:600;margin-top:8px}.ticket .hint{border-top:1px dashed #8a929c;margin-top:10px;padding-top:6px;color:#3c434d}' +
  '.thermal body,.thermal{font-size:11px}.thermal .ph{flex-direction:column;text-align:center;gap:4px}.thermal h1{font-size:14px}' +
  '.thermal th,.thermal td{border:0;border-bottom:1px dashed #8a929c;padding:4px 2px}.thermal th{background:none}.thermal .sign{display:none}.thermal .sig{width:100%}'

// Lấy @font-face Be Vietnam Pro đang nạp trong app (đường dẫn font đổi thành tuyệt đối) để giấy in cùng phông chữ.
function fontFaceCss() {
  const out = []
  for (const sheet of document.styleSheets) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const r of rules) {
      if (r.type !== CSSRule.FONT_FACE_RULE || !/Be Vietnam/i.test(r.style.getPropertyValue('font-family'))) continue
      const base = sheet.href || location.href
      out.push(r.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) => 'url("' + new URL(u, base).href + '")'))
    }
  }
  return out.join('')
}

// In bằng iframe ẩn vì cửa sổ Electron chặn mở cửa sổ mới (setWindowOpenHandler → deny).
// Khổ giấy theo loại giấy tờ (doc) là cài đặt riêng máy; set: cài đặt dùng để in — trang Cài đặt truyền bản nháp để in thử.
export function printHtml(title, body, doc = 'other', set = getSettings()) {
  const paper = PAPERS.find((x) => x.key === (getDevice().papers[doc] ?? 'A4')) ?? PAPERS[0]
  const thermal = paper.key.endsWith('mm')
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc_ = frame.contentDocument
  doc_.open()
  doc_.write(
    '<!doctype html><html' +
      (thermal ? ' class="thermal"' : '') +
      '><head><meta charset="utf-8"><title>' +
      esc(title) +
      '</title><style>@page{size:' +
      paper.css +
      ';margin:' +
      (thermal ? '3mm' : '12mm') +
      '}' +
      fontFaceCss() +
      PRINT_CSS +
      '</style></head><body>' +
      printHeaderHtml(set) +
      body +
      (set.print.footer ? '<div class="pf">' + esc(set.print.footer) + '</div>' : '') +
      '</body></html>'
  )
  doc_.close()
  // Chờ phông chữ nạp xong (tối đa 1,5 giây) rồi mới in để chữ không bị thay bằng Arial.
  const go = () => {
    frame.contentWindow.focus()
    frame.contentWindow.print()
    setTimeout(() => frame.remove(), 1000)
  }
  Promise.race([doc_.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(go, 50))
}
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
