# Triển khai trên máy admin phòng khám

Sáu dịch vụ trong `docker-compose.yml`: `caddy` (HTTPS, cổng 443, là cổng duy nhất mở ra LAN), `api`, `worker` (AI),
`db` (PostgreSQL 16), `ollama` (LLM cục bộ) và `migrate` (chạy `alembic upgrade head` một lần mỗi lần khởi động rồi thoát).
Máy dev vẫn dùng `docker-compose.dev.yml` (chỉ `db`).

Yêu cầu: Windows có Docker Desktop (WSL 2) và driver NVIDIA mới (Docker Desktop tự dùng GPU qua WSL); máy không có GPU dùng `-Cpu`.
**Không cần cài Ollama hay tải model bằng tay:** Ollama chạy trong container, `start.ps1` tự tải model (5.8 GB) vào volume lần đầu.
Nếu máy đã cài Ollama trên Windows thì tắt nó đi (Quit ở khay hệ thống) để không tranh VRAM với container.

## Lần đầu

Chạy PowerShell tại thư mục gốc repo.

1. `Copy-Item deploy\.env.example deploy\.env`, điền mật khẩu ngẫu nhiên, `JWT_SECRET_KEY`, `OLLAMA_MODEL`.
2. Đặt IP tĩnh cho máy admin, rồi cấp chứng chỉ: `.\deploy\scripts\new-certs.ps1 -HostName 192.168.1.10`
   (thêm tên máy nếu client gọi bằng tên: `-HostName 192.168.1.10,may-admin`).
3. Chép `deploy\certs\medassist-root-ca.crt` (chỉ file `.crt`) sang `client\certs\` qua PR để đóng gói vào app.
4. `.\deploy\scripts\start.ps1` (hoặc `start.ps1 -Cpu`). Lần đầu build image, tạo CSDL, tải model.
5. Tạo tài khoản và nạp dữ liệu, chạy trong container api:
   ```powershell
   docker compose -f deploy\docker-compose.yml --env-file deploy\.env exec api python -m scripts.create_user --username admin --full-name "Quản trị viên" --role Admin
   docker compose -f deploy\docker-compose.yml --env-file deploy\.env exec api python -m scripts.seed_drugs
   docker compose -f deploy\docker-compose.yml --env-file deploy\.env exec api python -m scripts.import_okf --submit
   ```
   Bản tri thức nạp vào ở trạng thái chờ duyệt; bác sĩ duyệt trên giao diện quản trị tri thức.
6. Đăng ký sao lưu hằng ngày (PowerShell quyền Administrator): `.\deploy\scripts\register-backup-task.ps1 -At 22:00`.
7. Tắt chế độ ngủ của máy admin.

Client nhập địa chỉ `https://192.168.1.10` (đúng IP/tên đã cấp chứng chỉ).

## Hằng ngày

| Việc | Lệnh |
| --- | --- |
| Bật / cập nhật sau khi kéo code mới | `.\deploy\scripts\start.ps1` |
| Cho máy dev mượn Ollama (chỉ giai đoạn phát triển) | `.\deploy\scripts\start.ps1 -OllamaLan`; chạy lại `start.ps1` không có `-OllamaLan` để đóng cổng |
| Tắt (giữ dữ liệu) | `.\deploy\scripts\stop.ps1` |
| Sao lưu ngay | `.\deploy\scripts\backup.ps1` (giữ 14 bản mới nhất trong `deploy\backups\`) |
| Khôi phục | `.\deploy\scripts\restore.ps1 -File deploy\backups\<file>.dump` |
| Cấp lại chứng chỉ (đổi IP, sắp hết hạn) | `new-certs.ps1 -HostName <IP>` rồi `docker compose ... restart caddy` |

`deploy\certs\` (khóa riêng của CA) và `deploy\backups\` không bao giờ commit. Giữ một bản `medassist-root-ca.key`
ngoài máy admin (USB cất riêng): mất khóa này thì phải cấp CA mới và cài lại app trên mọi máy client.
