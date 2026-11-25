# ADR-0009: Hoãn dời code sang cấu trúc features/

**Bối cảnh.** Code chia theo loại (`api/`, `components/`, `pages/<vai trò>/`). Cấu trúc theo tính năng (`features/billing/…`)
dễ tìm hơn khi app lớn.

**Quyết định.** Không dời hàng loạt trước buổi bảo vệ: đổi đường dẫn hàng trăm file sẽ xung đột với mọi PR đang mở của nhóm.
Code mới dùng chung đặt ở `components/ui`, `lib/`; khi gộp nhánh nâng cấp vào `develop` sẽ dời từng khu vực một (mỗi PR một khu vực,
chỉ đổi đường dẫn, không đổi logic).

**Hệ quả.** Cấu trúc hiện tại vẫn theo quy tắc ở README §3. Việc dời làm sau, có e2e + dấu vân tay CSS để kiểm không đổi hành vi.
