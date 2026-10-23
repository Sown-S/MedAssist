# MedAssist — Backend (FastAPI + PostgreSQL)

Hướng dẫn chạy backend **trên máy dev** (Windows, PowerShell). Cập nhật: 18/10/2026 — Sprint 2.

- **Stack:** Python 3.14, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16 (Docker), JWT, Argon2id.
- **Cách chạy trên máy dev:** CSDL chạy trong **Docker**; API chạy **trực tiếp bằng Python** (`uvicorn --reload`) để sửa code là thấy ngay.
- **Đã có:** đăng nhập/phân quyền, nhật ký (audit-log), tài khoản, bệnh nhân, lượt khám và hàng đợi, kho thuốc, chẩn đoán, kê đơn (trừ kho FEFO), cấp phát, hóa đơn, thu tiền. **Chưa có:** module AI, tri thức OKF (Sprint 3), Docker cho máy admin (giai đoạn đóng gói).
- Phân quyền thư mục, quy ước nhánh: xem *Quy định v5*, *Cấu trúc v5* (thư mục tài liệu của nhóm).

> Các lệnh dưới đây chạy trong **PowerShell**. Đường dẫn ví dụ: repo ở `D:\Projects\Github Repo\CDSS` — thay bằng đường dẫn trên máy bạn.

---

## Mục lục

1. [Cần cài gì](#1-cần-cài-gì)
2. [Chạy lần đầu](#2-chạy-lần-đầu)
3. [Chạy hằng ngày](#3-chạy-hằng-ngày)
4. [Thử API trên Swagger](#4-thử-api-trên-swagger)
5. [Chạy test](#5-chạy-test)
6. [Nạp / cập nhật danh mục thuốc](#6-nạp--cập-nhật-danh-mục-thuốc)
7. [Làm lại CSDL từ đầu](#7-làm-lại-csdl-từ-đầu)
8. [Biến môi trường](#8-biến-môi-trường-serverenv)
9. [Danh sách API](#9-danh-sách-api)
10. [Lỗi thường gặp](#10-lỗi-thường-gặp)
11. [Cấu trúc thư mục server/](#11-cấu-trúc-thư-mục-server)

---

## 1. Cần cài gì

| Phần mềm | Ghi chú |
|---|---|
| **Docker Desktop** | Chạy PostgreSQL. Mở Docker Desktop trước khi chạy lệnh `docker`. |
| **Python 3.14** | Cùng phiên bản với máy Sơn (`python --version`). Bản khác có thể không cài được một số gói trong `requirements.txt`. |
| **Git** | |
| PyCharm *(không bắt buộc)* | Settings → Editor → Code Style → Line separator = **Unix (\n)**. |

Cổng dùng trên máy: **5432** (PostgreSQL, chỉ mở cho `127.0.0.1`), **8000** (API).

---

## 2. Chạy lần đầu

### 2.1. Lấy code

```powershell
cd "D:\Projects\Github Repo\CDSS"
git fetch origin
git checkout <nhánh của bạn>          # vd feature/backend-core, feature/ai-module
git merge origin/develop
```

### 2.2. Tạo 2 file `.env` (mật khẩu ngẫu nhiên)

Chạy **ở gốc repo**. Đoạn lệnh tự sinh mật khẩu và ghi cả `deploy/.env` (cho Docker) lẫn `server/.env` (cho API) sao cho **khớp nhau**. Hai file này **không được commit** (đã có trong `.gitignore`).

```powershell
cd "D:\Projects\Github Repo\CDSS"
function New-Pw { -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 20 | % {[char]$_}) }
$pg=New-Pw; $owner=New-Pw; $app=New-Pw; $bk=New-Pw; $jwt=New-Pw+New-Pw+New-Pw
[IO.File]::WriteAllText("$PWD\deploy\.env", "POSTGRES_PASSWORD=$pg`nMEDASSIST_OWNER_PASSWORD=$owner`nMEDASSIST_APP_PASSWORD=$app`nMEDASSIST_BACKUP_PASSWORD=$bk`nMEDASSIST_CREATE_EVAL_DB=0`nMEDASSIST_CREATE_TEST_DB=1`n")
[IO.File]::WriteAllText("$PWD\server\.env", "ENVIRONMENT=dev`nDATABASE_URL=postgresql+psycopg://medassist_app:$app@127.0.0.1:5432/medassist`nMIGRATION_DATABASE_URL=postgresql+psycopg://medassist_owner:$owner@127.0.0.1:5432/medassist`nJWT_SECRET_KEY=$jwt`n")
```

> Mật khẩu **chỉ được đặt khi tạo CSDL lần đầu**. Nếu sau này tạo lại `.env` mà vẫn giữ CSDL cũ → lỗi đăng nhập DB (xem [mục 10](#10-lỗi-thường-gặp)).

### 2.3. Bật PostgreSQL trong Docker

```powershell
netstat -ano | findstr :5432
```
Nếu có dòng `LISTENING` → máy đã có PostgreSQL cài trên Windows chiếm cổng 5432. Tắt nó trước
(`Stop-Service postgresql*` trong PowerShell chạy quyền Admin, hoặc tắt trong *services.msc*).

```powershell
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up -d
docker ps        # medassist-db phải ở trạng thái (healthy) sau ~10 giây
```

Lần đầu, container tự tạo 3 vai trò (`medassist_owner`, `medassist_app`, `medassist_backup`), múi giờ
`Asia/Ho_Chi_Minh`, sắp xếp tiếng Việt (ICU vi-VN) và database `medassist_test` cho pytest.

### 2.4. Môi trường Python

Venv đặt ở **gốc repo** (`CDSS\venv`), dùng chung cho `server/`.

```powershell
cd "D:\Projects\Github Repo\CDSS"
python -m venv venv
.\venv\Scripts\activate
cd server
pip install -r requirements.txt
```

### 2.5. Tạo bảng (Alembic)

```powershell
alembic upgrade head        # 0001 lược đồ v1.8 (25 bảng) -> 0002 tài khoản system -> 0003 chỉ mục
alembic current             # phải in: 0003 (head)
```

### 2.6. Tạo 3 tài khoản dev

Mỗi lệnh hỏi mật khẩu (nhập ẩn, **tối thiểu 8 ký tự**). Mật khẩu tự đặt, **không ghi vào repo**.

```powershell
python -m scripts.create_user --username admin --full-name "Quản trị viên" --role Admin
python -m scripts.create_user --username bs01  --full-name "Bác sĩ Thử"    --role Physician
python -m scripts.create_user --username yta01 --full-name "Y tá Thử"      --role Nurse
```

| Tài khoản | Vai trò | Dùng để thử |
|---|---|---|
| `admin` | Admin | Tài khoản, nhật ký, tham số, kho. **Không** xem được dữ liệu bệnh nhân. |
| `bs01` | Physician | Nhận khám, chẩn đoán, kê đơn, mở lại đơn. |
| `yta01` | Nurse | Bệnh nhân, lượt khám, hàng đợi, kho, cấp phát, thu tiền. |

Tài khoản thêm sau: đăng nhập `admin` rồi dùng `POST /api/v1/admin/users`.

### 2.7. Nạp danh mục thuốc

```powershell
python -m scripts.seed_drugs
```
Kết quả: `Thuốc mới: 386, ... lô mới: 386 ...`. Xem [mục 6](#6-nạp--cập-nhật-danh-mục-thuốc).

### 2.7b. Nạp tri thức lâm sàng (OKF của Tuấn, thư mục `knowledge/`)

```powershell
python -m scripts.import_okf --dry-run          # kiểm tra + xem thay đổi, không ghi
python -m scripts.import_okf --approve-as bs    # máy dev: tạo bản phát hành và kích hoạt ngay
```

- Script kiểm toàn bộ thư mục trước (mã, độ dài, nguồn, `condition_logic`, chạy thử bằng bộ đánh giá luật của
  pipeline); có lỗi thì in danh sách và **không ghi gì**.
- Chỉ mục mới hoặc có nội dung khác mới tạo phiên bản mới; chạy lại khi không có gì đổi thì báo "Không có thay đổi".
- Bản sửa sau: đổi `label` trong `knowledge/_release.md` (vd `KB-2026.02`) rồi chạy lại.
- Không có `--approve-as`: tạo bản **Draft** (thêm `--submit` để gửi duyệt) chờ bác sĩ duyệt qua API quản trị tri thức.
- Người duyệt phải là Physician khác người soạn (mặc định người soạn là tài khoản `system`, đổi bằng `--as <admin>`).
- `--retire-missing`: mục đang Active mà đã bị xóa khỏi thư mục sẽ bị tắt khi kích hoạt.

### 2.8. Chạy test (nên làm lần đầu để chắc môi trường đúng)

```powershell
pytest            # ~2 phút, phải ra: 999 passed
```

### 2.9. Chạy API

```powershell
uvicorn app.main:app --reload
```

- Swagger (tài liệu + thử API): <http://127.0.0.1:8000/docs>
- Kiểm tra kết nối: <http://127.0.0.1:8000/health> → `{"status": "healthy", "database": {"ok": true, ...}, "ai": {"ok": ..., "detail": ...}, "version": ...}`

Dừng API: `Ctrl + C`.

### 2.10. Chạy worker AI (terminal thứ hai)

Worker là tiến trình riêng: lấy việc đánh giá AI từ hàng đợi trong PostgreSQL, gọi Ollama, ghi kết quả.

```powershell
.\venv\Scripts\activate     # ở thư mục gốc repo
cd server
python -m app.worker
```

- Máy **không có Ollama**: đặt trong `server/.env`
  - `LLM_PROVIDER=fake`: LLM giả lập tất định, chạy đủ luồng `Ready`/`Full` (lý do, chip triệu chứng gợi ý).
    Chỉ dùng cho dev, CI, demo; `ENVIRONMENT=prod` sẽ từ chối khởi động. Nhật ký AI ghi `model_name = "fake"`.
  - `LLM_PROVIDER=none`: không gọi LLM, kết quả chỉ còn xếp hạng tất định (`Degraded`, `RuleOnly`).
- Có Ollama: `OLLAMA_BASE_URL`, `OLLAMA_MODEL` trong `server/.env` (chỉ nhận địa chỉ trong máy / mạng LAN).
- Cờ đỏ KHÔNG phụ thuộc worker: được kiểm ngay lúc xếp hàng, worker tắt vẫn hiện cảnh báo.

Dừng worker: `Ctrl + C`. Việc đang chạy dở sẽ được sweeper xếp lại sau khi hết lease.

---

## 3. Chạy hằng ngày

```powershell
cd "D:\Projects\Github Repo\CDSS"
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up -d     # nếu Docker chưa chạy db
.\venv\Scripts\activate
git fetch origin
git merge origin/develop
cd server
pip install -r requirements.txt     # chỉ cần khi requirements.txt đổi (vô hại nếu chạy thừa)
alembic upgrade head                # chỉ cần khi có migration mới (vô hại nếu chạy thừa)
uvicorn app.main:app --reload
```

Tắt CSDL khi không dùng (dữ liệu **vẫn giữ**): `docker compose -f deploy/docker-compose.dev.yml stop`

---

## 4. Thử API trên Swagger

1. Mở <http://127.0.0.1:8000/docs>.
2. `POST /api/v1/auth/login` → *Try it out* → body:
   ```json
   {"username": "yta01", "password": "<mật khẩu đã đặt>"}
   ```
3. Chép giá trị `access_token` trong kết quả.
4. Bấm nút **Authorize** (góc trên phải) → dán token (không cần chữ `Bearer`) → *Authorize*.
5. Gọi các API khác. Access token hết hạn sau **15 phút** → đăng nhập lại (client dùng `POST /api/v1/auth/refresh` với `refresh_token`, hạn 8 giờ).

**Thử trọn một lượt khám:**

| Bước | Tài khoản | API |
|---|---|---|
| 1 | yta01 | `POST /patients` → `POST /visits` (`patient_id`, `chief_complaint`) → `PATCH /visits/{id}/check-in` |
| 2 | bs01 | `PATCH /visits/{id}/start-exam` → `POST /visits/{id}/diagnoses` `{"diagnosis_name": "Viêm họng cấp", "icd10_code": "J02.9"}` |
| 3 | bs01 | `GET /drugs?q=amoxicilin` lấy `drug_id` → `PUT /visits/{id}/prescription` → `POST /visits/{id}/prescription/confirm` (trả hóa đơn Pending) |
| 4 | yta01 | `GET /billing/awaiting` → `POST /visits/{id}/dispense-all` → `POST /visits/{id}/invoice/pay` `{"payment_method": "Cash"}` → lượt khám **Finished** |
| 5 | admin | `GET /admin/audit-logs` — xem dấu vết (không chứa tên bệnh, tên thuốc, thông tin cá nhân) |

**Định dạng lỗi** (mọi API):
```json
{"error": {"code": "STOCK_SHORTAGE", "message": "Không đủ thuốc ...", "details": [...], "request_id": "..."}}
```
`code` để client xử lý, `message` tiếng Việt để hiển thị, `details[].field` để tô đỏ ô nhập. Lỗi 500 chỉ có
`request_id` — tìm chi tiết trong log của terminal đang chạy uvicorn.

---

## 5. Chạy test

```powershell
cd server
pytest                                  # toàn bộ (~1 phút)
pytest tests/api/test_billing.py        # một file
pytest -k "reopen"                      # theo tên test
pytest -x                               # dừng ở lỗi đầu tiên
```

- Test chạy trên database **`medassist_test`** (tự suy ra từ `server/.env`, đổi tên database), **dựng lại từ
  Alembic mỗi lần chạy**. Dữ liệu dev trong `medassist` **không bị ảnh hưởng**. Test từ chối chạy nếu trỏ nhầm DB khác.
- `tests/api/` gọi API qua HTTP; `tests/unit/` kiểm tra hàm, CSDL (trigger, quyền), dữ liệu.
- **Chạy `pytest` trước khi mở PR** (Quy định v5, nguyên tắc vàng #15). Chưa có CI.
- Test của công cụ dữ liệu thuốc chạy riêng trong `tools/` (không cần DB): xem `tools/drug_data/README.md`.

---

## 6. Nạp / cập nhật danh mục thuốc

Danh mục: `server/data/drugs.csv` — **386 thuốc** ngoại trú chọn từ Phụ lục I Thông tư 19/2018/TT-BYT
(100 thuốc chọn tay + 286 thuốc thêm tự động, giá ước tính). Nguồn, cột: `server/data/README.md`.

```powershell
python -m scripts.seed_drugs                     # thuốc + 1 lô ban đầu/thuốc; chạy lại không tạo trùng
python -m scripts.seed_drugs --no-batches        # chỉ danh mục (khi cài máy admin)
python -m scripts.seed_drugs --deactivate-others # ngừng dùng thuốc không còn trong drugs.csv (không xóa)
```

- Đi qua `inventory_service` bằng tài khoản `system` → có kiểm tra dữ liệu và ghi nhật ký như nhập tay.
- Dòng **chưa có giá** bị bỏ qua và in ra danh sách (CSDL bắt buộc giá bán).
- **Chạy lại không cập nhật** thuốc đã có (giá, tên...). Sửa thuốc đã có: giao diện / `PATCH /api/v1/drugs/{id}`.
- Tạo / cập nhật `drugs.csv` (đối chiếu văn bản, thêm thuốc, giá): công cụ ở `tools/drug_data/` — xem README trong đó.

---

## 7. Làm lại CSDL từ đầu

Dùng khi: CSDL lỗi, đổi mật khẩu trong `.env`, thiếu `medassist_test`, hoặc muốn dữ liệu sạch.
**Xóa toàn bộ dữ liệu dev** (bệnh nhân, tài khoản, kho...).

```powershell
cd "D:\Projects\Github Repo\CDSS"
docker compose -f deploy/docker-compose.dev.yml down -v      # -v: xóa luôn volume dữ liệu
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up -d
.\venv\Scripts\activate
cd server
alembic upgrade head
# tạo lại 3 tài khoản (mục 2.6), rồi:
python -m scripts.seed_drugs
```

> Không dùng `alembic downgrade base` trên DB dev để "làm sạch": lệnh này bị chặn (cần
> `MEDASSIST_ALLOW_DROP_SCHEMA=1`) vì xóa sạch lược đồ. Cách trên đơn giản và chắc hơn.

---

## 8. Biến môi trường (`server/.env`)

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `DATABASE_URL` | Có | | Kết nối của API — vai trò `medassist_app` (không có quyền sửa/xóa nhật ký) |
| `MIGRATION_DATABASE_URL` | Có | | Chỉ Alembic dùng — vai trò `medassist_owner` |
| `JWT_SECRET_KEY` | Có | | Khóa ký token, **≥ 32 ký tự**, mỗi máy một khóa riêng |
| `ENVIRONMENT` | | `dev` | `prod` thì tắt `/docs`, kiểm tra cấu hình chặt hơn |
| `CORS_ORIGINS` | | `["http://localhost:5173","http://127.0.0.1:5173"]` | Nguồn giao diện được gọi API (JSON). Đổi khi biết client Electron tải giao diện từ đâu |
| `LOG_LEVEL` | | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | | `15` | Hạn access token |
| `REFRESH_TOKEN_EXPIRE_HOURS` | | `8` | Hạn refresh token (một ca làm việc) |
| `LOGIN_MAX_FAILURES_PER_USER` / `_PER_IP` | | `5` / `20` | Số lần sai trong 15 phút trước khi khóa 5 phút |
| `TRUSTED_PROXIES` | | `[]` | IP proxy được tin `X-Forwarded-For` (Caddy trên máy admin) |
| `LLM_PROVIDER` | | `ollama` | `fake` = LLM giả lập (dev, CI, demo; cấm ở prod), `none` = không gọi LLM |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | | `http://127.0.0.1:11434` / `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M` | LLM cục bộ cho worker (một model cho trích xuất và reasoning) |
| `OLLAMA_KEEP_ALIVE` | | `5m` | Thời gian Ollama giữ model trong VRAM sau mỗi request; máy admin dùng `24h` |
| `AI_ASSESSMENT_TIMEOUT_SECONDS` | | `90` | Ngân sách một lần đánh giá, tính từ lúc xếp hàng |
| `WORKER_LEASE_SECONDS` / `WORKER_MAX_ATTEMPTS` | | `150` / `2` | Hạn thuê việc; số lần thử trước khi `Failed` |
| `TEST_DATABASE_URL` / `TEST_MIGRATION_DATABASE_URL` | | tự suy ra | Ghi đè DB cho pytest (thường không cần) |

`deploy/.env`: mật khẩu `postgres` và 3 vai trò; `MEDASSIST_CREATE_TEST_DB=1` (tạo `medassist_test`),
`MEDASSIST_CREATE_EVAL_DB` (tạo `medassist_eval` cho đánh giá NCKH, Sprint 3). Chỉ có tác dụng **khi tạo volume lần đầu**.

---

## 9. Danh sách API

Tiền tố `/api/v1`. Chi tiết tham số và schema: **Swagger `/docs`** (luôn đúng với code hiện tại).

| Nhóm | Đường dẫn | Vai trò |
|---|---|---|
| Xác thực | `POST auth/login`, `auth/refresh`, `auth/logout`, `auth/change-password`; `GET auth/me` | Mọi người |
| Tài khoản | `GET/POST admin/users`; `GET/PATCH admin/users/{id}`; `POST admin/users/{id}/reset-password` | Admin |
| Nhật ký | `GET admin/audit-logs`; `GET admin/audit-logs/export` (xlsx mặc định, csv) | Admin |
| Báo cáo, nhật ký AI | `GET reports/summary` (`date_from`, `date_to`, mặc định hôm nay); `GET admin/ai-logs` (lọc ngày, `run_type`, `status`, `mode`; chỉ metadata) | Admin |
| Tham số | `GET admin/settings`; `PUT admin/settings/{key}` | Admin |
| Bệnh nhân | `GET/POST patients`; `GET/PATCH patients/{id}`; `GET patients/{id}/visits` | Nurse tạo/sửa; Physician, Nurse xem |
| Lượt khám | `POST visits`; `GET/PATCH visits/{id}`; `PATCH visits/{id}/check-in`, `/start-exam`, `/release`, `/cancel`; `GET queue`; `GET visits/stale`; `POST visits/stale/cancel` | Nurse; Physician (nhận khám, trả lại, hủy lượt của mình) |
| Thuốc, kho | `GET/POST drugs`; `GET/PATCH drugs/{id}`; `GET inventory/stock`, `/alerts`, `/reconciliation`; `GET/POST inventory/batches`; `GET inventory/batches/{id}`; `POST …/top-up`, `…/adjustments`; `GET …/movements` | Admin, Nurse; Physician xem |
| Triệu chứng (HITL) | `GET/PUT visits/{id}/symptoms` | Nurse, Physician (lượt khám còn mở) |
| Chẩn đoán | `GET/POST visits/{id}/diagnoses`; `PATCH diagnoses/{id}`; `POST diagnoses/{id}/retract` | Physician đang khám; Nurse xem |
| Đơn thuốc | `GET/PUT/DELETE visits/{id}/prescription`; `POST …/prescription/confirm`, `…/prescription/reopen`; `POST visits/{id}/complete-exam` | Physician đang khám; Nurse xem |
| Cấp phát, thu tiền | `GET billing/awaiting`; `GET billing/invoices` (`date`, `include_cancelled`); `GET/PATCH visits/{id}/invoice`; `GET …/invoice/print`; `POST …/invoice/pay`; `PATCH prescription-items/{id}/dispense`; `POST visits/{id}/dispense-all` | Nurse; Physician xem hóa đơn |
| Tri thức: bản phát hành | `GET/POST admin/knowledge/releases`; `GET …/releases/{id}` (kèm thay đổi); `POST …/{id}/submit`; `POST …/{id}/approve`, `…/{id}/reject` | Admin soạn, gửi duyệt; Physician duyệt / từ chối |
| Tri thức: soạn nháp | `PUT admin/knowledge/symptoms/{mã}`, `conditions/{mã}`, `relations/{bệnh}/{triệu chứng}`, `excerpts/{mã}`, `rules/{mã}`; `DELETE …/{loại}/{mã}/draft`; `GET/POST admin/knowledge/sources` | Admin |
| Tri thức: xem, tắt khẩn cấp | `GET admin/knowledge/{loại}` (lọc `status`, `q`); `GET …/{loại}/{mã}/versions`; `GET …/{loại}/{mã}/dependents`; `POST …/{loại}/{mã}/deactivate` | Admin, Physician xem; Admin tắt |
| Hệ thống | `GET /health` (CSDL lỗi trả 503; AI lỗi vẫn 200, `ai.ok = false`), `GET /` (không có tiền tố) | Không cần đăng nhập |

Quy ước chung: tiền trả về **dạng số** (VNĐ); mọi GET dữ liệu bệnh nhân ghi nhật ký VIEW; header
`X-Request-ID` có trong mọi phản hồi (gửi kèm khi báo lỗi).

---

## 10. Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `docker: ... cannot find the file specified` / `error during connect` | Docker Desktop chưa chạy | Mở Docker Desktop, đợi biểu tượng hết xoay |
| `Bind for 127.0.0.1:5432 failed: port is already allocated` | PostgreSQL Windows (hoặc container khác) chiếm cổng | `netstat -ano \| findstr :5432` → tắt service PostgreSQL Windows; `docker ps` xem container khác |
| `password authentication failed for user "medassist_app"` | `.env` đổi sau khi CSDL đã tạo (mật khẩu cũ nằm trong volume) | Dùng lại `.env` cũ, hoặc [làm lại CSDL](#7-làm-lại-csdl-từ-đầu) |
| `database "medassist_test" does not exist` khi chạy pytest | Volume tạo từ trước khi có `MEDASSIST_CREATE_TEST_DB=1` | Kiểm tra `deploy/.env` có dòng đó → [làm lại CSDL](#7-làm-lại-csdl-từ-đầu) |
| Container `medassist-db` dừng ngay, log có `$'\r': command not found` | File `.sh` bị đổi sang CRLF | `git config core.autocrlf false`, xóa `server/db/initdb/01_roles.sh` rồi `git checkout -- server/db/initdb/01_roles.sh` (`.gitattributes` ép LF), làm lại CSDL |
| `ModuleNotFoundError: No module named 'app'` / `'fastapi'` | Chưa `activate` venv hoặc không đứng trong `server/` | `.\venv\Scripts\activate` (ở gốc repo), `cd server` |
| `ValidationError ... DATABASE_URL Field required` (khi chạy uvicorn/alembic) hoặc `Thiếu DATABASE_URL trong server/.env` (khi chạy pytest) | Chưa tạo `server/.env`, hoặc đang đứng sai thư mục | [Mục 2.2](#22-tạo-2-file-env-mật-khẩu-ngẫu-nhiên); chạy lệnh trong `server/` |
| `API phải kết nối bằng medassist_app...` / `Migration phải chạy bằng medassist_owner` | Đổi nhầm vai trò trong `server/.env` | `DATABASE_URL` dùng `medassist_app`, `MIGRATION_DATABASE_URL` dùng `medassist_owner` |
| `pip install` báo `No matching distribution` | Khác phiên bản Python | Dùng Python 3.14 như máy Sơn |
| `pip install` lỗi đọc `requirements.txt` (ký tự lạ) | File bị ghi UTF-16 (PowerShell `>`) | Ghi lại: `python -m pip freeze \| Out-File -Encoding ascii requirements.txt` |
| `alembic check` báo có thay đổi | Sửa model mà chưa có revision | Báo Sơn — mọi thay đổi bảng đi qua migration |
| Đăng nhập trả `429` `RATE_LIMITED` | Sai mật khẩu 5 lần trong 15 phút | Đợi 5 phút (hoặc Admin `reset-password`) |
| API trả `401` sau một lúc | Access token hết hạn (15 phút) | Đăng nhập lại / `auth/refresh` |
| API trả `403` | Sai vai trò (vd Admin xem bệnh nhân) | Đúng thiết kế — dùng tài khoản đúng vai trò |
| `[Errno 10048]` khi chạy uvicorn | Cổng 8000 đang bị dùng (uvicorn cũ còn chạy) | Đóng terminal cũ, hoặc `uvicorn app.main:app --reload --port 8001` |
| Client (Electron/Vite) báo lỗi CORS | Nguồn giao diện chưa có trong `CORS_ORIGINS` | Thêm vào `server/.env`, vd `CORS_ORIGINS=["http://localhost:5173"]`, khởi động lại uvicorn |

---

## 11. Cấu trúc thư mục `server/`

```
server/
├── app/
│   ├── core/          # cấu hình, DB, bảo mật (JWT, Argon2id), phân quyền, nhật ký VIEW, request-id
│   ├── models/        # 25 model ORM theo ERD v1.8
│   ├── routers/       # auth, admin, clinic, inventory, prescription, billing
│   ├── schemas/       # Pydantic vào/ra
│   ├── services/      # nghiệp vụ (audit, user, emr, queue, inventory, prescription, invoice, billing, settings)
│   ├── validation/    # kiểm tra dùng chung: sinh hiệu (JSON Schema), mã OKF, tham số
│   ├── exceptions.py  # định dạng lỗi thống nhất
│   └── main.py
├── alembic/           # migration 0001–0003 (alembic.ini ở server/)
├── db/                # initdb (vai trò, múi giờ), lược đồ v1.8, tài khoản system
├── data/              # drugs.csv + README (nguồn danh mục thuốc)
├── scripts/           # create_user, seed_drugs (dùng code của app)
├── tests/             # api/, unit/ — chạy trên medassist_test
├── .env.example
├── pytest.ini
└── requirements.txt
```

Tài liệu liên quan: ERD v1.8, Architecture v1.7, *Quy định v5*, *Cấu trúc v5*; `server/data/README.md`;
`tools/drug_data/README.md`.
