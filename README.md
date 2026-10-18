# MedAssist — Hệ thống hỗ trợ quyết định lâm sàng (CDSS) cho phòng khám ngoại trú

| Thư mục | Nội dung | Phụ trách | Hướng dẫn |
|---|---|---|---|
| `server/` | Backend FastAPI + PostgreSQL | Sơn (module AI: Huy) | **[server/README.md](server/README.md)** — cách chạy backend |
| `client/` | Ứng dụng desktop Electron + React | Anh | *(đang xây dựng)* |
| `tools/` | Công cụ chạy trên máy dev (dữ liệu thuốc) | Sơn | [tools/drug_data/README.md](tools/drug_data/README.md) |
| `deploy/` | Docker Compose (máy dev: chỉ PostgreSQL) | Sơn | [server/README.md](server/README.md) mục 2 |
| `knowledge/`, `evaluation/`, `training/` | Kho tri thức OKF, đánh giá NCKH, huấn luyện | Tuấn |  |
| `docs/` | Tài liệu | Cả nhóm | |

## Chạy nhanh backend (đã cài đủ theo server/README.md)

```powershell
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up -d
.\venv\Scripts\activate
cd server
alembic upgrade head
uvicorn app.main:app --reload      # http://127.0.0.1:8000/docs
```

## Quy trình làm việc

- Nhánh tích hợp: **`develop`**. Mỗi người làm trên nhánh `feature/...` của mình, mở **Pull Request vào `develop`**
  (không push thẳng `main` / `develop`). Cuối sprint: `develop` → `main`.
- Trước khi làm: `git fetch origin` rồi `git merge origin/develop`. Trước khi mở PR: chạy `pytest` trong `server/`.
- Chỉ sửa thư mục được phân công — xem *Quy định phân chia thư mục v5*.
