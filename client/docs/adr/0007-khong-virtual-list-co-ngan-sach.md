# ADR-0007: Chưa dùng danh sách ảo; giữ ngân sách hiệu năng trong e2e

**Bối cảnh.** Danh sách ảo (virtual list) giảm DOM cho bảng dài nhưng làm khó tìm trong trang, in, phím tắt bảng và trình đọc màn hình.

**Quyết định.** Đo trước (11/2026, 13 trang chính): không long task nào > 50 ms, trang lớn nhất ~900 phần tử; danh sách lớn
(bệnh nhân, thuốc, kho, nhật ký) đã phân trang. Không dùng virtual list. `e2e/perf.spec.mjs` giữ ngân sách: không long task
> 300 ms, DOM < 3000 phần tử khi mở mỗi trang. Gói theo vai trò tải lười (`React.lazy`).

**Hệ quả.** Code bảng đơn giản. Khi e2e perf đỏ (dữ liệu lớn hơn, màn mới) thì phân trang trước, virtual list sau.
