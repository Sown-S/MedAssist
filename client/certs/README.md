# Chứng chỉ gốc (root CA) của dự án

Đặt **chứng chỉ công khai** của CA dự án vào thư mục này, ví dụ `medassist-root-ca.crt` (PEM).

- CA do `deploy/scripts/new-certs.ps1` tạo trên máy admin (xem `deploy/README.md`). Sơn mở PR thêm file `.crt`, Nhật Anh duyệt.
- **Không bao giờ** đặt khóa riêng (`*.key`) ở đây; `.gitignore` đã chặn `*.key`.
- Khi đóng gói (`npm run build:win`), các file `*.crt` / `*.pem` được chép vào `resources/certs` của bản cài.
- Tạo CA mới (mất khóa, đổi máy admin) thì phải thay file ở đây, build lại và cài lại app trên mọi máy client.

Ứng dụng (`src/main/index.js` + `src/main/certPin.js`) chỉ chấp nhận chứng chỉ của **máy chủ đã cấu hình** khi chuỗi chứng chỉ
do CA trong thư mục này ký, khớp tên máy / IP và còn hạn (Architecture TC03). Bản đóng gói thiếu file CA sẽ từ chối kết nối.
Máy dev chưa có file CA thì dùng kiểm tra mặc định của Chromium (không tắt kiểm tra).
