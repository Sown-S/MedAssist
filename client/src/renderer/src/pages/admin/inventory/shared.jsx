import { useState } from 'react'
import { translate } from '../../../i18n'
import { getSettings, PAPERS } from '../../../api/settingsStore'
import { getDevice } from '../../../api/deviceSettings'

export const UNITS = [
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
  ok: { label: 'Sufficient', cls: 'ok' },
  low: { label: 'Low stock', cls: 'warn' },
  out: { label: 'Out of stock', cls: 'low' },
  near: { label: 'Near expiry', cls: 'warn' },
  expired: { label: 'Has expired batches', cls: 'low' },
  inactive: { label: 'Discontinued', cls: 'muted' }
}

export const MOVE_TYPES = {
  in: 'Stock in',
  out: 'Stock out',
  return: 'Returned to stock'
}

export const fmtMoney = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('vi-VN') + 'đ' : '—')
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
  if (!batch) return <span className="ai-soft">—</span>
  const d = batch.days
  const cls = d < 0 ? 'inv-exp bad' : d <= 30 ? 'inv-exp bad' : d <= 90 ? 'inv-exp warn' : 'inv-exp'
  return (
    <span className={cls}>
      <span className="mono">{fmtDate(batch.expiry)}</span>{' '}
      {d < 0 ? (
        <span className="ai-small">(expired)</span>
      ) : d <= 90 ? (
        <span className="ai-small">
          (<span className="mono">{d}</span> <span>days left</span>)
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
        <span className="mono">
          {from}–{to}
        </span>{' '}
        <span>of</span> <span className="mono">{total}</span>
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
            <input type="number" min="1" max={pages} value={jump} onChange={(e) => setJump(e.target.value)} />
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
export const PRINT_CSS =
  'body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:24px}' +
  'h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 6px}' +
  '.meta{margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:8px}' +
  'th,td{border:1px solid #444;padding:4px 6px;text-align:left}th{background:#eee}' +
  '.num{text-align:right}.blank{min-width:70px}.sign{display:flex;justify-content:space-between;margin-top:40px}' +
  '.sign div{text-align:center;width:30%}.sign i{display:block;font-size:11px;margin-top:50px}' +
  '.ph{display:flex;gap:10px;align-items:center;border-bottom:1px solid #000;padding-bottom:6px;margin-bottom:12px;font-size:11px}' +
  '.ph img{max-height:48px;max-width:90px}.ph b{font-size:13px;text-transform:uppercase}' +
  '.pf{margin-top:18px;border-top:1px dashed #666;padding-top:6px;text-align:center;font-size:11px;font-style:italic}' +
  '.thermal body,.thermal{margin:4px;font-size:11px}.thermal .ph{flex-direction:column;text-align:center}.thermal .sign{display:none}'

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
      PRINT_CSS +
      '</style></head><body>' +
      printHeaderHtml(set) +
      body +
      (set.print.footer ? '<div class="pf">' + esc(set.print.footer) + '</div>' : '') +
      '</body></html>'
  )
  doc_.close()
  setTimeout(() => {
    frame.contentWindow.focus()
    frame.contentWindow.print()
    setTimeout(() => frame.remove(), 1000)
  }, 100)
}
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
