import { useEffect, useRef } from 'react'

// Phím tắt dùng chung cho mọi vai trò (bảng đầy đủ trong Trợ giúp, mở bằng F1 hoặc ?):
//   Alt+1…9   mở mục menu thứ 1…9          Ctrl+B   thu gọn / mở rộng thanh menu
//   F1 hoặc ? mở Trợ giúp & phím tắt       Ctrl+,   mở Cài đặt
//   Ctrl+F    nhảy tới ô tìm kiếm của trang Ctrl+S   bấm nút Lưu (nút có data-shortcut="save")
//   Ctrl+N    bấm nút Thêm của trang (nút có data-shortcut="new": thêm phòng, tài khoản, thuốc, nhập kho…)
//   Mũi tên   di chuyển giữa các mục trong danh sách / nhóm nút (không áp dụng khi đang gõ trong ô nhập)
//   ↑ ↓ trong bảng: từ một nút ở một dòng sang nút cùng vị trí ở dòng trên / dưới (Enter để bấm)
// Phím tắt riêng từng màn (F2 tiếp đón, Alt+N mời bệnh nhân…) vẫn nằm ở màn đó.
export const OPEN_EVENT = 'medassist:open'
const openPanel = (what) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: what }))

const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
const visible = (el) => !!el && el.offsetParent !== null && !el.closest('[aria-hidden="true"]')
// Phạm vi đang dùng: hộp thoại trên cùng nếu có, không thì cả trang.
const scope = () => [...document.querySelectorAll('.ov.show .modal')].pop() ?? document

// Nhóm cho phím mũi tên và các phần tử bấm được trong nhóm.
const GROUP = '[role="radiogroup"],[role="tablist"],.seg,.utabs,.tri,.vtabs,.pset-nav,.queue,.srch,.pick-grid,.scale-pick,.swatches,.lang-pick,.menu,.side nav,.leave-reasons,.lab-pick'
const ITEM = 'button:not(:disabled),[role="button"],[role="tab"],a[href],.lab-pick-row input'

// Bảng: đang đứng ở một nút trong dòng → ↑ ↓ sang dòng kề, cùng thứ tự nút (dòng kề ít nút hơn thì nút cuối);
// Home / End: dòng đầu / cuối. ← → vẫn đi giữa các nút trong cùng dòng.
const CELL_ITEM = 'button:not(:disabled),a[href],[role="button"],input[type=checkbox]'
function moveInTable(el, k) {
  const row = el.closest('tbody tr')
  if (!row || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k)) return false
  const rows = [...row.parentElement.children].filter((r) => r.querySelector(CELL_ITEM) && visible(r))
  const items = (r) => [...r.querySelectorAll(CELL_ITEM)].filter(visible)
  const i = rows.indexOf(row)
  const col = items(row).indexOf(el.closest(CELL_ITEM))
  if (i < 0 || col < 0) return false
  const j = k === 'Home' ? 0 : k === 'End' ? rows.length - 1 : k === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)
  const target = items(rows[j])
  target[Math.min(col, target.length - 1)]?.focus()
  return true
}

function moveFocus(e) {
  const el = document.activeElement
  if (!el || (typing(el) && !el.matches('input[type=checkbox]'))) return false
  if (moveInTable(el, e.key)) return true
  const group = el.closest(GROUP)
  if (!group) return false
  const items = [...group.querySelectorAll(ITEM)].filter(visible)
  const i = items.indexOf(el.closest(ITEM) ?? el)
  if (i < 0 || items.length < 2) return false
  const k = e.key
  const next = k === 'Home' ? 0 : k === 'End' ? items.length - 1 : k === 'ArrowDown' || k === 'ArrowRight' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1)
  if (next === i) return true
  items.at(next).focus()
  return true
}

export default function useGlobalKeys({ onToggleSidebar }) {
  const ref = useRef(onToggleSidebar)
  ref.current = onToggleSidebar
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key
      const inModal = !!document.querySelector('.ov.show')
      // Mũi tên trong danh sách / nhóm nút
      if (!ctrl && !e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)) {
        if (moveFocus(e)) e.preventDefault()
        return
      }
      // Alt+1…9: mục menu
      if (e.altKey && !ctrl && /^[1-9]$/.test(k) && !inModal) {
        const navs = [...document.querySelectorAll('.side .nav')].filter(visible)
        const t = navs.at(Number(k) - 1)
        if (t) {
          e.preventDefault()
          t.click()
        }
        return
      }
      if (ctrl && !e.altKey && k.toLowerCase() === 'b' && !inModal) {
        e.preventDefault()
        ref.current?.()
        return
      }
      if (ctrl && k === ',') {
        e.preventDefault()
        openPanel('settings')
        return
      }
      if ((k === 'F1' || (k === '?' && !typing(document.activeElement))) && !inModal) {
        e.preventDefault()
        openPanel('help')
        return
      }
      if (ctrl && !e.altKey && k.toLowerCase() === 'f') {
        const box = [...scope().querySelectorAll('.search input, input[type="search"]')].find(visible)
        if (box) {
          e.preventDefault()
          box.focus()
          box.select?.()
        }
        return
      }
      if (ctrl && !e.altKey && !e.shiftKey && k.toLowerCase() === 'n' && !typing(document.activeElement)) {
        const btn = [...scope().querySelectorAll('[data-shortcut="new"]')].find((b) => visible(b) && !b.disabled)
        if (btn) {
          e.preventDefault()
          btn.click()
        }
        return
      }
      if (ctrl && !e.altKey && k.toLowerCase() === 's') {
        e.preventDefault()
        const btn = [...scope().querySelectorAll('[data-shortcut="save"]')].find((b) => visible(b) && !b.disabled)
        btn?.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
