# Chứng chỉ gốc (root CA) của dự án

Đặt **chứng chỉ công khai** của CA dự án vào thư mục này, ví dụ `medassist-root-ca.crt` (PEM).

- Sơn tạo CA và cấp chứng chỉ cho Caddy trên máy admin (Quy định v5 §1: Sơn mở PR thêm chứng chỉ gốc công khai, Anh duyệt).
- **Không bao giờ** đặt khoá riêng (`*.key`) ở đây.
- Khi đóng gói (`npm run build:win`), các file `*.crt` / `*.pem` được chép vào `resources/certs` của bản cài.

Ứng dụng (`src/main/index.js` + `src/main/certPin.js`) chỉ chấp nhận chứng chỉ của **máy chủ đã cấu hình** khi chuỗi chứng chỉ
do CA trong thư mục này ký, khớp tên máy / IP và còn hạn (Architecture TC03). Bản đóng gói thiếu file CA sẽ từ chối kết nối.
Máy dev chưa có file CA thì dùng kiểm tra mặc định của Chromium (không tắt kiểm tra).
