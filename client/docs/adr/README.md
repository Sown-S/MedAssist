# Quyết định kiến trúc của client (ADR)

Mỗi file một quyết định: **Bối cảnh** (vì sao phải chọn), **Quyết định**, **Hệ quả** (được gì, mất gì, khi nào xem lại).
Đổi quyết định thì thêm ADR mới ghi "thay thế ADR-xxxx", không sửa ADR cũ.

| Số | Quyết định | Trạng thái |
|---|---|---|
| [0001](0001-javascript-khong-typescript.md) | Giữ JavaScript, chưa chuyển TypeScript | Chấp nhận |
| [0002](0002-i18n-jsx-runtime.md) | Giữ bộ dịch bằng JSX runtime tự viết, không chuyển i18next | Chấp nhận |
| [0003](0003-tanstack-query-khong-provider.md) | Dữ liệu đọc qua TanStack Query, một QueryClient, không Provider | Chấp nhận |
| [0004](0004-hop-dong-api-openapi-zod.md) | Hợp đồng API: ảnh chụp OpenAPI + fixture thật + zod sinh tự động, chỉ cảnh báo | Chấp nhận |
| [0005](0005-csp-chat-in-bang-cssstylesheet.md) | CSP không 'unsafe-inline'; phiếu in nạp CSS bằng CSSStyleSheet | Chấp nhận |
| [0006](0006-css-giu-file-cu-co-cong-cu-kiem.md) | Chưa gộp 10-legacy / 90-mock; dọn CSS bằng công cụ đo, component mới dùng CSS Modules | Chấp nhận |
| [0007](0007-khong-virtual-list-co-ngan-sach.md) | Chưa dùng danh sách ảo; giữ ngân sách hiệu năng trong e2e | Chấp nhận |
| [0008](0008-e2e-electron-may-chu-that.md) | e2e chạy Electron thật với máy chủ thật đã seed | Chấp nhận |
| [0009](0009-cau-truc-features-hoan.md) | Hoãn dời code sang cấu trúc features/ | Chấp nhận |
