# MedAssist: hệ thống hỗ trợ quyết định lâm sàng cho phòng khám ngoại trú

Đồ án tốt nghiệp nhóm **C1SE.28**, International School, Đại học Duy Tân (16/08 – 05/12/2026).

MedAssist là phần mềm quản lý phòng khám ngoại trú có gắn module AI hỗ trợ phân loại ưu tiên và gợi ý chẩn đoán phân biệt.
Toàn bộ hệ thống chạy trong mạng LAN của phòng khám: một máy admin làm máy chủ (API, CSDL, LLM cục bộ), các máy
còn lại cài ứng dụng desktop. Không gửi dữ liệu bệnh nhân ra ngoài, không dùng API LLM trên Internet.

## Chức năng chính

| Vai trò | Làm được gì |
|---|---|
| **Lễ tân** (Nurse) | Đăng ký, tra cứu bệnh nhân; tiếp đón với lời kể, triệu chứng có cấu trúc, sinh hiệu; check-in, bảng gọi số; cấp phát thuốc, thu tiền, hóa đơn; quản lý kho cùng Quản trị |
| **Bác sĩ** (Physician) | Hàng đợi theo mức ưu tiên; khám, chẩn đoán ICD-10, kê đơn (trừ kho FEFO khi chốt); xem gợi ý AI tham khảo; hồ sơ khám cũ; duyệt bản tri thức lâm sàng |
| **Quản trị** (Admin) | Tài khoản, phòng khám, danh mục thuốc và lô, tham số hệ thống, nhật ký hoạt động, báo cáo, soạn tri thức lâm sàng. Không xem được dữ liệu bệnh nhân |

**Module AI** (chỉ hỗ trợ, bác sĩ quyết định):

1. **Node 1 – Cổng cờ đỏ**: luật tất định trên triệu chứng đã xác nhận và sinh hiệu. Cờ đỏ thì xếp Cấp cứu ngay và không chạy LLM.
2. **Node 2 – Truy xuất**: chấm điểm bệnh trong kho tri thức (124 bệnh, 99 triệu chứng, 11 luật, nguồn Bộ Y tế).
3. **Node 3 – Suy luận**: LLM cục bộ (Gemma-SEA-LION 9B qua Ollama) xếp hạng lại và giải thích bằng tiếng Việt.
4. **Node 4 – Kiểm tra đầu ra**: chỉ giữ bệnh có trong danh sách Node 2, đúng schema; lỗi thì quay về kết quả theo luật.

Trích xuất triệu chứng từ lời kể chỉ là **gợi ý**: lễ tân phải xác nhận từng triệu chứng trước khi luật và AI dùng tới (human-in-the-loop).

## Kiến trúc

```
Máy client (Windows)              Máy admin (Docker Compose)
+--------------------+  HTTPS    +---------------------------------------------+
| MedAssist desktop  |  (LAN)    |  caddy :443 --> api (FastAPI) --> db        |
| Electron + React   | --------> |                                 (PostgreSQL)|
| ghim CA dự án      |           |  worker (AI) --> db, ollama (LLM cục bộ)    |
+--------------------+           |  migrate: alembic upgrade head mỗi lần bật  |
                                 +---------------------------------------------+
```

- API ghi việc AI vào hàng đợi trong PostgreSQL; `worker` là tiến trình riêng, lấy việc, gọi Ollama và ghi kết quả.
  Worker hoặc LLM lỗi thì cờ đỏ và kết quả theo luật vẫn có.
- Tri thức lâm sàng soạn bằng Markdown (thư mục `knowledge/`), nạp vào CSDL bằng script, Admin soạn và Bác sĩ duyệt mới được dùng.

## Thư mục

| Thư mục | Nội dung | Phụ trách | Hướng dẫn |
|---|---|---|---|
| `server/` | Backend FastAPI + PostgreSQL, module AI, worker | Sơn (AI: Huy) | [server/README.md](server/README.md) |
| `client/` | Ứng dụng desktop Electron + React | Nhật Anh | [client/README.md](client/README.md) |
| `deploy/` | Docker Compose, Caddy, script bật / tắt / sao lưu cho máy admin | Sơn | [deploy/README.md](deploy/README.md) |
| `knowledge/` | Kho tri thức lâm sàng OKF (Markdown) | Tuấn | [knowledge/_spec/okf_format.md](knowledge/_spec/okf_format.md) |
| `evaluation/` | Bộ test đóng băng cho đánh giá NCKH | Tuấn | [evaluation/testset/README.md](evaluation/testset/README.md) |
| `tools/` | Công cụ máy dev: thu thập danh mục thuốc | Sơn | [tools/drug_data/README.md](tools/drug_data/README.md) |
| `docs/` | Hướng dẫn sử dụng, hướng dẫn demo | Cả nhóm | [docs/](docs/) |

## Bắt đầu nhanh

| Bạn muốn | Đọc |
|---|---|
| Cài máy admin cho phòng khám hoặc buổi demo | [deploy/README.md](deploy/README.md) |
| Chạy backend trên máy dev | [server/README.md](server/README.md) mục 2 |
| Chạy ứng dụng desktop (giả lập hoặc nối server) | [client/README.md](client/README.md) mục 1 |
| Dùng phần mềm theo vai trò | [docs/huong-dan-su-dung.md](docs/huong-dan-su-dung.md) |
| Chuẩn bị demo, kiểm thử AI | [docs/huong-dan-demo-kiem-thu-ai.md](docs/huong-dan-demo-kiem-thu-ai.md) |
| Đóng góp code | [CONTRIBUTING.md](CONTRIBUTING.md) |

Chạy backend trên máy dev (đã cài theo server/README.md):

```powershell
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up -d
.\venv\Scripts\activate
cd server
alembic upgrade head
uvicorn app.main:app --reload      # http://127.0.0.1:8000/docs
```

## Công nghệ

| Phần | Dùng |
|---|---|
| Backend | Python 3.14, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16, JWT + Argon2id |
| AI | Pipeline 4 node, Ollama, Gemma-SEA-LION-v3-9B-IT (GGUF Q4_K_M) |
| Client | Electron 31, React 18, electron-vite, Vitest |
| Triển khai | Docker Compose, Caddy (HTTPS bằng CA riêng của dự án), sao lưu `pg_dump` hằng ngày |
| Kiểm thử | pytest (hơn 1.000 test, CI yêu cầu độ phủ ≥ 90%), Vitest cho client, GitHub Actions |

## Nhóm

| Thành viên | Vai trò |
|---|---|
| Võ Nguyễn Trung Sơn | Trưởng nhóm, Scrum Master; CSDL, backend, triển khai |
| Lê Nhật Anh | Ứng dụng desktop, giao diện human-in-the-loop |
| Huy | Module AI: pipeline, tích hợp LLM, bộ luật |
| Tuấn | Kho tri thức OKF, đánh giá thực nghiệm (NCKH) |

## Lưu ý

- Gợi ý AI chỉ để tham khảo; MedAssist không thay thế quyết định của bác sĩ và không đánh giá đơn thuốc (tương tác, liều).
- Danh mục thuốc, bộ tri thức và dữ liệu mẫu phục vụ đồ án; cần bác sĩ cố vấn rà soát trước khi dùng thật.
- Không commit `.env`, mật khẩu, khóa riêng của CA hay dữ liệu bệnh nhân thật.
