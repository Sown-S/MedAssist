# MedAssist (C1SE.28): chỉ dẫn cho Claude

CDSS cho phòng khám ngoại trú. `server/`: FastAPI + SQLAlchemy + Alembic + PostgreSQL. `client/`: Electron + Vite.
Quy ước nhánh, commit, PR: xem `CONTRIBUTING.md`.

## Chú thích trong code
Tóm tắt từ `CONTRIBUTING.md` mục 5:
- Mặc định không viết chú thích. Chỉ viết khi giải thích "tại sao": ràng buộc nghiệp vụ, bảo mật, hiệu năng, bẫy về thứ tự hoặc side effect.
- Không diễn giải lại code, không đánh số "Bước 1/2/3" cho code tuyến tính.
- Không để lại các chú thích kiểu `# New:`, `# Changed:`, `# Fixed:`, `# Thêm mới`; lịch sử thay đổi thuộc về commit message.
- Không để code comment-out, `print` debug, TODO không có mã task (`# TODO(MA-123): ...`).
- Docstring: module và hàm public tối đa 3 dòng (mục đích và ràng buộc quan trọng). Không liệt kê lại tham số khi type hint đã đủ. Hàm private hoặc ngắn thì không cần.
- Được tham chiếu mã yêu cầu hoặc tài liệu (VD `# AI-12`, `# Architecture v1.7 §4`) thay vì giải thích dài.
- Viết tiếng Việt có dấu, câu ngắn; giữ nguyên thuật ngữ kỹ thuật tiếng Anh.

## Phạm vi thay đổi
- Chỉ làm đúng phần được yêu cầu. Không tự thêm tính năng, abstraction, xử lý lỗi hay cấu hình ngoài yêu cầu.
- Theo cấu trúc sẵn có: `routers/` → `services/` → `models/`, `schemas/` cho Pydantic. Đặt tên theo file cùng loại đang có.
- Đổi model thì phải kèm migration Alembic; không sửa migration đã merge.
- Không sửa file ngoài phạm vi task (format lại, đổi tên, đổi xuống dòng) để tránh conflict với nhánh khác.

## Test
- `cd server; python -m pytest`, chạy trên DB `medassist_test` nên cần bật PostgreSQL (Docker) trước.
- Khi Docker chưa bật thì không chạy pytest; chỉ kiểm tra import: `cd server; python -c "import app.main"`.
