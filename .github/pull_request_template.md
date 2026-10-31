<!-- Tiêu đề PR: loại(phạm-vi): mô tả — vd "feat(server): API lịch sử khám". Xem CONTRIBUTING.md -->

## Thay đổi
-

## Card Trello
<!-- dán link card -->

## Kiểm tra
- [ ] Sửa `server/`: chạy `python -m pytest` trên máy, tất cả pass
- [ ] Có migration mới: đã chạy `alembic upgrade head` và `alembic check`
- [ ] Sửa `client/`: chạy `npm run lint`, `npm test` và `npm run build`
- [ ] Sửa `knowledge/`: chạy `python -m scripts.import_okf --dry-run` không lỗi
- [ ] Đã cập nhật README / tài liệu nếu đổi cách cài, cách chạy hoặc API
- [ ] Không commit `.env`, mật khẩu, khóa riêng, dữ liệu bệnh nhân thật
