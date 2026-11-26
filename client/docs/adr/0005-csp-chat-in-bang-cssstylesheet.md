# ADR-0005: CSP không 'unsafe-inline'; phiếu in nạp CSS bằng CSSStyleSheet

**Bối cảnh.** CSP cũ `default-src 'self' 'unsafe-inline'` cho phép style inline, giảm tác dụng chống chèn mã. Màn khởi động dùng
thẻ `<style>` trong `index.html`; phiếu in ghi thẻ `<style>` vào iframe (iframe kế thừa CSP của trang).

**Quyết định.** `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; …; object-src 'none'; base-uri 'none'`.
CSS khởi động tách ra `boot.css`. Phiếu in gắn CSS bằng `new CSSStyleSheet()` + `adoptedStyleSheets` (CSP không chặn CSSOM).
Chỉ `npm run dev` nới style/script inline và websocket HMR.

**Hệ quả.** `style={{…}}` của React vẫn dùng được (đặt qua CSSOM). Không được thêm thẻ `<style>` hay thuộc tính `style="…"`
trong chuỗi HTML (kể cả mẫu in) — `e2e/csp.spec.mjs` bắt vi phạm và kiểm trang in thử vẫn có định dạng.
