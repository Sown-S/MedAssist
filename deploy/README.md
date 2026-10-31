# Triển khai trên máy admin phòng khám

Máy admin chạy toàn bộ phía server bằng Docker Compose; các máy khác trong LAN chỉ cài ứng dụng desktop.
Máy dev vẫn dùng `docker-compose.dev.yml` (chỉ `db`), xem [`server/README.md`](../server/README.md).

| Dịch vụ | Vai trò | Mở ra LAN |
|---|---|---|
| `caddy` | HTTPS bằng chứng chỉ do CA của dự án cấp, chuyển tiếp vào `api` | Cổng **443** (duy nhất) |
| `api` | FastAPI (`ENVIRONMENT=prod`: tắt `/docs`, kiểm tra cấu hình chặt) | Không |
| `worker` | Lấy việc AI từ hàng đợi trong PostgreSQL, gọi Ollama, ghi kết quả | Không |
| `db` | PostgreSQL 16, múi giờ `Asia/Ho_Chi_Minh`, sắp xếp tiếng Việt (ICU vi-VN) | Không |
| `ollama` | LLM cục bộ (Gemma-SEA-LION 9B), giữ model trong VRAM 24 giờ, xử lý 1 ca một lúc | Không (trừ `-OllamaLan`) |
| `migrate` | Chạy `alembic upgrade head` mỗi lần khởi động rồi thoát; `api`, `worker` chỉ chạy khi bước này thành công | Không |

## Yêu cầu

- Windows 10/11 có **Docker Desktop** (WSL 2). Máy có GPU NVIDIA: cài driver mới, Docker Desktop tự dùng GPU qua WSL.
  Máy không có GPU: chạy được với `-Cpu` nhưng LLM chậm, nhiều ca sẽ rơi về kết quả theo luật (`Degraded`).
- Ổ đĩa trống khoảng 15 GB (model 5,8 GB, image, dữ liệu).
- **Không cần cài Ollama hay tải model bằng tay**: Ollama chạy trong container, `start.ps1` tự tải model vào volume lần đầu.
  Nếu máy đã cài Ollama trên Windows thì tắt nó (Quit ở khay hệ thống) để không tranh VRAM.
- IP tĩnh trong LAN (đặt trên router hoặc trong Windows) để client không phải đổi địa chỉ.

## Lần đầu

Chạy PowerShell tại thư mục gốc repo.

1. **Cấu hình**: `Copy-Item deploy\.env.example deploy\.env`, điền:
   - mật khẩu ngẫu nhiên cho `POSTGRES_PASSWORD` và 3 vai trò `MEDASSIST_*_PASSWORD`;
   - `JWT_SECRET_KEY` (tạo bằng `python -c "import secrets; print(secrets.token_urlsafe(48))"`);
   - `OLLAMA_MODEL` (giữ mặc định), `CORS_ORIGINS=["app://medassist"]` (giữ mặc định).

   Mật khẩu CSDL chỉ có tác dụng khi tạo volume lần đầu; đổi sau đó sẽ không đăng nhập được CSDL.
2. **Chứng chỉ**: `.\deploy\scripts\new-certs.ps1 -HostName 192.168.1.10`
   (thêm tên máy nếu client gọi bằng tên: `-HostName 192.168.1.10,may-admin`). Lần đầu script tạo CA của dự án, các lần sau chỉ cấp lại chứng chỉ máy chủ.
3. **Đóng gói CA vào app**: repo đã có `client\certs\medassist-root-ca.crt` của CA hiện tại. Cài lại trên máy admin cũ thì giữ nguyên
   `deploy\certs\` (hoặc chép lại `medassist-root-ca.crt` + `.key` từ bản cất riêng trước khi chạy bước 2) để không phải phát hành lại app.
   Chỉ khi tạo CA mới mới chép `deploy\certs\medassist-root-ca.crt` (chỉ file `.crt`) sang `client\certs\` qua PR và build lại bản cài
   (`client/README.md` mục 1). Bản cài không có CA khớp sẽ từ chối kết nối.
4. **Bật hệ thống**: `.\deploy\scripts\start.ps1` (hoặc `start.ps1 -Cpu`). Lần đầu build image, tạo CSDL, chạy migration, tải model.
   Kiểm tra: mở `https://192.168.1.10/health` trên máy admin, phải thấy `"database": {"ok": true}` và `"ai": {"ok": true}`.
5. **Tài khoản và dữ liệu**, chạy trong container `api` (mỗi lệnh `create_user` hỏi mật khẩu, tối thiểu 8 ký tự):
   ```powershell
   $dc = "docker compose -f deploy\docker-compose.yml --env-file deploy\.env"
   iex "$dc exec api python -m scripts.create_user --username admin --full-name 'Quản trị viên' --role Admin"
   iex "$dc exec api python -m scripts.create_user --username bs.duyet --full-name 'Bác sĩ duyệt tri thức' --role Physician"
   iex "$dc exec api python -m scripts.seed_drugs --no-batches"
   iex "$dc exec api python -m scripts.seed_services"
   iex "$dc exec api python -m scripts.import_okf --submit --approve-as bs.duyet"
   ```
   - `seed_drugs --no-batches`: chỉ nạp danh mục 386 thuốc; nhập lô thật ở màn Kho. Bỏ `--no-batches` nếu cần kho mẫu để demo.
   - `seed_services`: danh mục dịch vụ, xét nghiệm, gói khám với giá mẫu; Admin sửa giá thật ở **Quản trị › Danh mục** trước khi thu tiền.
   - `import_okf --submit --approve-as <bác sĩ>`: nạp thư mục `knowledge/` (gắn vào container ở `/knowledge`) và kích hoạt ngay.
     Muốn bác sĩ tự duyệt trên giao diện thì bỏ `--approve-as`; bản tri thức nằm ở trạng thái chờ duyệt, bác sĩ vào tab **Duyệt tri thức**.
   - Các tài khoản khác (bác sĩ từng phòng, lễ tân) do Admin tạo ở **Quản trị › Tài khoản nhân viên**; người dùng phải đổi mật khẩu ở lần đăng nhập đầu.
   - **Gắn phòng ngay sau khi tạo tài khoản bác sĩ** (cùng màn hình, mỗi phòng khám tối đa một bác sĩ). Bác sĩ chưa có phòng thì
     lễ tân không mời bệnh nhân vào phòng của bác sĩ đó được. Tài khoản `bs.duyet` tạo bằng lệnh ở trên cũng cần gắn phòng nếu bác sĩ này khám bệnh.
6. **Sao lưu hằng ngày** (PowerShell quyền Administrator): `.\deploy\scripts\register-backup-task.ps1 -At 22:00`.
7. Tắt chế độ ngủ của máy admin và cho Docker Desktop tự chạy khi đăng nhập Windows.

Trên mỗi máy client: cài bản `MedAssist Setup *.exe`, ở màn đăng nhập bấm **Máy chủ** và nhập `https://192.168.1.10`
(đúng IP hoặc tên máy đã cấp chứng chỉ).

## Hằng ngày

| Việc | Lệnh |
| --- | --- |
| Bật / cập nhật sau khi kéo code mới | `.\deploy\scripts\start.ps1` (build lại image, chạy migration mới nếu có) |
| Xem trạng thái | `docker compose -f deploy\docker-compose.yml --env-file deploy\.env ps` |
| Xem log | `... logs -f api` hoặc `... logs -f worker` |
| Tắt (giữ dữ liệu, giữ model) | `.\deploy\scripts\stop.ps1` |
| Sao lưu ngay | `.\deploy\scripts\backup.ps1` (giữ 14 bản mới nhất trong `deploy\backups\`) |
| Khôi phục | `.\deploy\scripts\restore.ps1 -File deploy\backups\<file>.dump` (ghi đè dữ liệu, phải gõ `KHOIPHUC` để xác nhận) |
| Cấp lại chứng chỉ (đổi IP, sắp hết hạn) | `new-certs.ps1 -HostName <IP>` rồi `... restart caddy` |
| Nạp bản tri thức mới | Đổi `label` trong `knowledge/_release.md`, `start.ps1`, rồi `... exec api python -m scripts.import_okf --submit` |
| Cho máy dev mượn Ollama (chỉ giai đoạn phát triển) | `.\deploy\scripts\start.ps1 -OllamaLan`; chạy lại `start.ps1` không có `-OllamaLan` để đóng cổng 11434 |

`...` là `docker compose -f deploy\docker-compose.yml --env-file deploy\.env`.

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `start.ps1` báo thiếu `deploy\.env` hoặc thiếu chứng chỉ | Làm bước 1, 2 ở trên |
| `migrate` thoát lỗi, `api` không chạy | `... logs migrate`; thường do mật khẩu trong `.env` khác lúc tạo volume |
| Client báo lỗi chứng chỉ | IP máy admin đã đổi, hoặc bản cài thiếu `medassist-root-ca.crt`: cấp lại chứng chỉ đúng IP / build lại bản cài |
| Client không kết nối được | Kiểm tra cùng mạng, `ping` IP máy admin, Windows Firewall cho phép cổng 443 vào |
| `/health` có `ai.ok = false` | `... logs ollama`; model chưa tải xong hoặc thiếu VRAM. Luật cờ đỏ vẫn chạy, gợi ý AI về `Degraded` |
| Gợi ý AI đứng ở `Pending` lâu | `... logs -f worker`; mỗi ca có LLM mất khoảng 10–40 giây, worker xử lý lần lượt |
| Bác sĩ không thấy gợi ý AI | Chưa có bản tri thức Active: chạy lại bước 5 (`import_okf`) |

## Bảo mật

- `deploy\.env`, `deploy\certs\` (khóa riêng của CA) và `deploy\backups\` **không bao giờ commit**.
- Giữ một bản `medassist-root-ca.key` ngoài máy admin (USB cất riêng): mất khóa này thì phải tạo CA mới và cài lại app trên mọi máy client.
- Chỉ Caddy mở cổng ra LAN. Ollama không có xác thực, nên chỉ mở cổng 11434 (`-OllamaLan`) trong giai đoạn phát triển.
- Sao lưu dùng vai trò chỉ đọc `medassist_backup`; API dùng `medassist_app`, không có quyền sửa / xóa nhật ký.
