import { useLayoutEffect, useRef, useState } from 'react'
import Modal, { ModalHeader, ModalCloseFooter } from './Modal'
import { translate } from '../i18n'

// Nội dung dài: chỉ hiện `lines` dòng kèm dấu “…”. Khi bị cắt thật mới bấm được (hoặc Enter) để mở hộp xem đầy đủ;
// nội dung ngắn thì là chữ thường, không có gì để bấm.
// title: tiêu đề hộp xem chi tiết; full: nội dung đầy đủ nếu khác children (VD children đã rút gọn).
export default function Clip({ children, lines = 1, title, full, className = '', as: Tag = 'span' }) {
  const ref = useRef(null)
  const [cut, setCut] = useState(false)
  const [open, setOpen] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setCut(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
    check()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children, lines])

  const show = (e) => {
    e.stopPropagation()
    setOpen(true)
  }
  return (
    <>
      <Tag
        ref={ref}
        className={'xclip' + (lines > 1 ? ' multi' : '') + (cut ? ' cut' : '') + (className ? ' ' + className : '')}
        style={{ '--lines': lines }}
        {...(cut
          ? {
              role: 'button',
              tabIndex: 0,
              title: translate('Click to see everything'),
              onClick: show,
              onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), show(e))
            }
          : {})}
      >
        {children}
      </Tag>
      {open && (
        <Modal open onClose={() => setOpen(false)}>
          <ModalHeader title={title ?? translate('Details')} onClose={() => setOpen(false)} />
          <div className="modal-b xclip-full">{full ?? children}</div>
          <ModalCloseFooter onClose={() => setOpen(false)} />
        </Modal>
      )}
    </>
  )
}
