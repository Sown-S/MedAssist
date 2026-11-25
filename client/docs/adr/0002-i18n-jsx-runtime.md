# ADR-0002: Giữ bộ dịch bằng JSX runtime tự viết, không chuyển i18next

**Bối cảnh.** Chuỗi giao diện viết tiếng Anh ngay trong JSX; runtime `@i18n/jsx-runtime` dịch sang tiếng Việt lúc tạo phần
tử (`vi.js`). i18next (khoá kiểu `reception.queue.title`) là lựa chọn phổ biến hơn.

**Quyết định.** Giữ runtime hiện tại. `tests/i18n.test.js` đọc mã nguồn và báo mọi chuỗi giao diện chưa có bản dịch, nên
không có chữ tiếng Anh lọt ra giao diện Việt.

**Hệ quả.** Không phải viết lại hàng nghìn chuỗi thành khoá. Đổi câu tiếng Anh thì phải đổi khoá trong `vi.js` (test báo).
Chuỗi ghép động cần `PATTERNS` hoặc `translate()`. Chữ con nằm trong component phải là mảng lồng — runtime dịch đệ quy
(`localizeList`). Xem lại nếu thêm ngôn ngữ thứ ba hoặc cần số nhiều phức tạp.
