# ADR-0003: Dữ liệu đọc qua TanStack Query, một QueryClient, không Provider

**Bối cảnh.** Các hook đọc (chờ thu tiền, đơn thuốc, hoá đơn, báo cáo) tự viết `useEffect + setInterval`, mỗi màn tự gọi
server, không dùng chung kết quả, xử lý lỗi mỗi nơi một kiểu.

**Quyết định.** Dùng TanStack Query v5 với một `queryClient` (`lib/queryClient.js`) truyền thẳng vào `useQuery(opts, queryClient)`
thay vì bọc `QueryClientProvider`. Hook giữ nguyên dạng trả về cũ. Hàng đợi, kho… vẫn là store `useSyncExternalStore`
(nhiều thao tác ghi cập nhật lạc quan, đã ổn định).

**Hệ quả.** Các màn cũ và `renderPage` trong test không phải đổi; hai màn cùng dữ liệu gọi server một lần; `reload()` thống nhất.
Test phải `queryClient.clear()` sau mỗi test (đã có ở `tests/setup.js`). Khi chuyển store hàng đợi sang Query thì cân nhắc
Provider để có devtools.
