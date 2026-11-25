# ADR-0008: e2e chạy Electron thật với máy chủ thật đã seed

**Bối cảnh.** Unit test giả lập server (`fakeServer.js`, `vi.doMock`) không bắt được lỗi ghép nối thật, CSS chỉ lộ trên Chromium,
CSP, in ấn.

**Quyết định.** Playwright `_electron` mở bản eval (`electron-vite build --mode eval`), nói chuyện với FastAPI + PostgreSQL thật
seed bằng `server/scripts/seed_eval.py` (CI job *Client e2e*). Test viết theo hướng chịu được dữ liệu đổi giữa các lần chạy
(chọn dòng theo trạng thái, `test.skip` khi dữ liệu hết). Ảnh so sánh chỉ dùng cho màn tĩnh (đăng nhập, cài đặt, mẫu in dữ liệu cố định).

**Hệ quả.** Bắt được lỗi thật (ví dụ: 6 nút hiện tiếng Anh, tiêu đề đơn thuốc in sai). e2e chậm hơn unit (~1,5 phút) nên chạy
ở job riêng sau job Client. Ảnh so sánh phụ thuộc phông / môi trường render — chụp lại bằng `npm run e2e:update` khi cố ý đổi.
