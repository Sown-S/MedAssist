import { useLayoutEffect } from 'react'

// Chạy lại hiệu ứng "vào trang" mỗi khi đổi mục trên thanh bên.
// Lễ tân / Bác sĩ đổi mục bằng ?view= nên khung trang (.content.view > .rhome | .vflow) không dựng lại,
// CSS "khi chèn vào" chỉ chạy một lần. Ở đây gỡ rồi gắn lại lớp .pg-stage lên .content.view để trình duyệt
// chạy lại animation (CSS ở 91-app-extras.css, tự tắt theo "Giảm hiệu ứng").
export default function usePageEnter(deps) {
  useLayoutEffect(() => {
    const view = document.querySelector('.main .content.view')
    if (!view) return
    view.classList.remove('pg-stage')
    void view.offsetWidth // ép trình duyệt tính lại để lần gắn lớp sau được coi là animation mới
    view.classList.add('pg-stage')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
