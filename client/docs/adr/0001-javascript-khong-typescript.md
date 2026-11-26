# ADR-0001: Giữ JavaScript, chưa chuyển TypeScript

**Bối cảnh.** Proposal §10 chọn JavaScript; nhóm thống nhất (11/2026) chưa chuyển TypeScript trong giai đoạn bảo vệ đồ án.
Rủi ro chính của JS là dữ liệu server đổi hình dạng mà client không biết.

**Quyết định.** Giữ JavaScript. Bù phần kiểm kiểu bằng: test hợp đồng với OpenAPI (ADR-0004), schema zod sinh tự động kiểm
response lúc chạy ở bản dev/eval, ESLint `--max-warnings 0`.

**Hệ quả.** Không tốn công đổi ~200 file trước buổi bảo vệ. Lỗi kiểu trong nội bộ client (truyền sai prop) vẫn chỉ bắt được
bằng test. Xem lại sau bảo vệ: có thể bật `// @ts-check` + JSDoc cho `api/` trước khi chuyển hẳn.
