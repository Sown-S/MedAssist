# ADR-0006: Chưa gộp 10-legacy / 90-mock; dọn CSS bằng công cụ đo; component mới dùng CSS Modules

**Bối cảnh.** CSS toàn cục ~190 KB chia 4 file theo thứ tự cascade; tên `10-legacy` / `90-mock` gợi ý code cũ. Gộp / đổi tên
hàng loạt dễ đổi giao diện mà không ai thấy, và xung đột với mọi PR CSS đang mở.

**Quyết định.** Không gộp trước buổi bảo vệ. Dọn bằng công cụ có kiểm chứng: `scripts/css/unused.mjs` (luật chết),
`shadowed.mjs` (khai báo bị ghi đè hoàn toàn), `vars.mjs` (biến), `tests/css.test.js` giữ mức sạch; `fingerprint.spec.mjs` +
`fpdiff.mjs` so computed style 17 trang × 4 kiểu giao diện trước / sau. Component dùng chung mới (`components/ui`) dùng CSS Modules.

**Hệ quả.** Lần dọn đầu: xoá 3 luật chết, 33 khai báo bị ghi đè, 4 biến thừa — dấu vân tay không đổi. CSS cũ hầu như không còn
chết, nên việc gộp còn lại chủ yếu là sắp xếp; làm sau bảo vệ, có dấu vân tay để kiểm.
