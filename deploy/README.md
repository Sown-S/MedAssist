# Triển khai trên máy admin phòng khám

Máy admin chạy toàn bộ phía server bằng Docker Compose; các máy khác trong LAN chỉ cài ứng dụng desktop.
Máy dev vẫn dùng `docker-compose.dev.yml` (chỉ `db`), xem [`server/README.md`](../server/README.md).
Kiểm thử trên một máy (Windows, macOS, Linux) không cần chứng chỉ hay GPU: `docker-compose.eval.yml` + `eval.env`,
xem [`docs/huong-dan-kiem-thu.md`](../docs/huong-dan-kiem-thu.md).

| Dịch vụ | Vai trò | Mở ra LAN |
|---|---|---|
| `caddy` | HTTPS bằng chứng chỉ do CA của dự án cấp, chuyển tiếp vào `api` | Cổng **443** (duy nhất) |
| `api` | FastAPI (`ENVIRONMENT=prod`: tắt `/docs`, kiểm tra cấu hình chặt) | Không |
| `worker` | Lấy việc AI từ hàng đợi trong PostgreSQL, gọi Ollama, ghi kết quả | Không |
| `db` | PostgreSQL 16, múi giờ `Asia/Ho_Chi_Minh`, sắp xếp tiếng Việt (ICU vi-VN) | Không |
| `ollama` | LLM cục bộ (Gemma-SEA-LION 9B), giữ model trong VRAM 24 giờ, xử lý 1 ca một lúc | Không (trừ `-OllamaLan`) |
| `migrate` | Chạy `alembic upgrade head` mỗi lần khởi động rồi thoát; `api`, `worker` chỉ chạy khi bước này thành công | Không |

## Chọn cách chạy

| Cách | Máy chủ chạy bằng | Nhập ở ô **Máy chủ** của app | Chứng chỉ |
|---|---|---|---|
| Một máy (kiểm thử, giảng viên) | `docker-compose.eval.yml` ([docs/huong-dan-kiem-thu.md](../docs/huong-dan-kiem-thu.md)); AI tùy chọn qua `eval.env` | `http://127.0.0.1:8000` (mặc định của bản cài trên GitHub) | Không cần |
| Máy admin, dùng ngay trên máy đó | `docker-compose.yml` (mục dưới) | `https://localhost` | Có `localhost`, `127.0.0.1` |
| Máy admin qua Tailscale (mỗi máy một mạng) | `docker-compose.yml` | `https://<tên Tailscale của máy admin>`, vd `https://medassist-server` | Có tên ngắn, tên `.ts.net`, IP 100.x |
| Máy admin trong một mạng chung (router, điểm phát Wi-Fi) | `docker-compose.yml` | `https://<IP LAN của máy admin>` | Có IP LAN |

Một chứng chỉ dùng được cho cả ba cách dưới, cấp một lần trên máy admin (bỏ phần IP LAN nếu chưa có):

```powershell
.\deploy\scripts\new-certs.ps1 -HostName medassist-server,medassist-server.tailxxxx.ts.net,100.x.y.z,localhost,127.0.0.1,192.168.1.10
docker compose -f deploy\docker-compose.yml --env-file deploy\.env restart caddy
```

Đổi mạng LAN (IP khác) thì chạy lại lệnh trên với IP mới; CA giữ nguyên nên bản cài trên client không đổi.
Môi trường một máy (`medassist-eval`) và máy admin (`medassist`) là hai bộ riêng (CSDL, cổng khác nhau), chạy song song được,
nhưng không bật AI cho cả hai cùng lúc trên một máy vì hai bản Ollama tranh nhau VRAM.

## Yêu cầu

- Windows 10/11 có **Docker Desktop** (WSL 2). Máy có GPU NVIDIA: cài driver mới, Docker Desktop tự dùng GPU qua WSL.
  Máy không có GPU: chạy được với `-Cpu` nhưng LLM chậm, nhiều ca sẽ rơi về kết quả theo luật (`Degraded`).
- Ổ đĩa trống khoảng 15 GB (model 5,8 GB, image, dữ liệu).
- **Không cần cài Ollama hay tải model bằng tay**: Ollama chạy trong container, `start.ps1` tự tải model vào volume lần đầu.
  Nếu máy đã cài Ollama trên Windows thì tắt nó (Quit ở khay hệ thống) để không tranh VRAM.
- Địa chỉ ổn định để client không phải đổi: IP tĩnh trong LAN (đặt trên router hoặc trong Windows), hoặc tên máy trên
  Tailscale khi các máy không chung một mạng (mục [Kết nối qua Tailscale](#kết-nối-qua-tailscale)).

## Lần đầu

Chạy PowerShell tại thư mục gốc repo.

1. **Cấu hình**: `Copy-Item deploy\.env.example deploy\.env`, điền:
   - mật khẩu ngẫu nhiên cho `POSTGRES_PASSWORD` và 3 vai trò `MEDASSIST_*_PASSWORD`;
   - `JWT_SECRET_KEY` (tạo bằng `python -c "import secrets; print(secrets.token_urlsafe(48))"`);
   - `OLLAMA_MODEL` (giữ mặc định), `CORS_ORIGINS=["app://medassist"]` (giữ mặc định).

   Mật khẩu CSDL chỉ có tác dụng khi tạo volume lần đầu; đổi sau đó sẽ không đăng nhập được CSDL.
2. **Chứng chỉ**: `.\deploy\scripts\new-certs.ps1 -HostName 192.168.1.10`
   (thêm tên máy nếu client gọi bằng tên: `-HostName 192.168.1.10,may-admin`; qua Tailscale thì dùng tên MagicDNS và IP 100.x,
   vd `-HostName may-admin.tail1234.ts.net,100.101.102.103`). Lần đầu script tạo CA của dự án, các lần sau chỉ cấp lại chứng chỉ máy chủ.
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
   iex "$dc exec api python -m scripts.seed_referral_facilities"
   iex "$dc exec api python -m scripts.import_okf --submit --approve-as bs.duyet"
   ```
   - `seed_drugs --no-batches`: chỉ nạp danh mục 386 thuốc; nhập lô thật ở màn Kho. Bỏ `--no-batches` nếu cần kho mẫu để demo.
   - `seed_services`: danh mục dịch vụ, xét nghiệm, gói khám với giá mẫu; Admin sửa giá thật ở **Quản trị › Danh mục** trước khi thu tiền.
   - `seed_referral_facilities`: danh mục bệnh viện, trung tâm y tế để gợi ý nơi chuyển tuyến (vẫn gõ tự do được).
   - `import_okf --submit --approve-as <bác sĩ>`: nạp thư mục `knowledge/` (gắn vào container ở `/knowledge`) và kích hoạt ngay.
     Muốn bác sĩ tự duyệt trên giao diện thì bỏ `--approve-as`; bản tri thức nằm ở trạng thái chờ duyệt, bác sĩ vào tab **Duyệt tri thức**.
   - Các tài khoản khác (bác sĩ từng phòng, lễ tân) do Admin tạo ở **Quản trị › Tài khoản nhân viên**; người dùng phải đổi mật khẩu ở lần đăng nhập đầu.
   - **Gắn phòng ngay sau khi tạo tài khoản bác sĩ** (cùng màn hình, mỗi phòng khám tối đa một bác sĩ). Bác sĩ chưa có phòng thì
     lễ tân không mời bệnh nhân vào phòng của bác sĩ đó được. Tài khoản `bs.duyet` tạo bằng lệnh ở trên cũng cần gắn phòng nếu bác sĩ này khám bệnh.
6. **Sao lưu hằng ngày** (PowerShell quyền Administrator), chép thêm sang ổ thứ hai hoặc USB:
   `.\deploy\scripts\register-backup-task.ps1 -At 22:00 -CopyTo E:\MedAssistBackup`.
   Sau đó làm một lần mục [Thử khôi phục](#thử-khôi-phục) để chắc bản sao lưu dùng được.
7. **Mã hóa ổ đĩa** (NFR02): bật BitLocker cho ổ `C:` (Windows Pro: **Settings › Privacy & security › Device encryption**
   hoặc **Control Panel › BitLocker Drive Encryption**; Windows Home chỉ có Device encryption nếu máy hỗ trợ). Dữ liệu CSDL nằm
   trong ổ ảo WSL của Docker Desktop trên `C:` nên mã hóa `C:` là đủ. Cất khóa khôi phục (recovery key) ngoài máy admin.
8. Tắt chế độ ngủ của máy admin và cho Docker Desktop tự chạy khi đăng nhập Windows.

Trên mỗi máy client: cài bản `MedAssist Setup *.exe`, ở màn đăng nhập bấm **Máy chủ** và nhập `https://192.168.1.10`
(đúng IP hoặc tên máy đã cấp chứng chỉ).

## Hằng ngày

| Việc | Lệnh |
| --- | --- |
| Bật / cập nhật sau khi kéo code mới | `.\deploy\scripts\start.ps1` (build lại image, chạy migration mới nếu có) |
| Xem trạng thái | `docker compose -f deploy\docker-compose.yml --env-file deploy\.env ps` |
| Xem log | `... logs -f api` hoặc `... logs -f worker` |
| Tắt (giữ dữ liệu, giữ model) | `.\deploy\scripts\stop.ps1` |
| Sao lưu ngay | `.\deploy\scripts\backup.ps1 -CopyTo E:\MedAssistBackup` (giữ 14 bản mới nhất ở `deploy\backups\` và ở thư mục chép thêm) |
| Khôi phục | `.\deploy\scripts\restore.ps1 -File deploy\backups\<file>.dump` (gõ `KHOIPHUC` để xác nhận): khôi phục vào CSDL mới, kiểm quyền rồi mới thay CSDL đang chạy; CSDL cũ giữ tên `medassist_truoc_<thời điểm>` |
| Cấp lại chứng chỉ (đổi IP, sắp hết hạn) | `new-certs.ps1 -HostName <IP>` rồi `... restart caddy` |
| Nạp bản tri thức mới | Đổi `label` trong `knowledge/_release.md`, `start.ps1`, rồi `... exec api python -m scripts.import_okf --submit --approve-as <bác sĩ> --retire-missing`. Có bỏ bệnh, triệu chứng, luật khỏi `knowledge/` thì bắt buộc `--retire-missing` kèm `--approve-as`: không có hai cờ này, mục đã bỏ vẫn Active (chạy `--dry-run` trước để xem danh sách sẽ bị tắt) |
| Cho máy dev mượn Ollama (chỉ giai đoạn phát triển) | `.\deploy\scripts\start.ps1 -OllamaLan`; chạy lại `start.ps1` không có `-OllamaLan` để đóng cổng 11434 |

`...` là `docker compose -f deploy\docker-compose.yml --env-file deploy\.env`.

## Thử khôi phục

Làm một lần sau khi cài và sau mỗi lần đổi cách sao lưu (NFR04: quy trình khôi phục phải được thử):

1. `.\deploy\scripts\backup.ps1 -CopyTo E:\MedAssistBackup`, ghi lại số lượt khám, số bệnh nhân đang thấy trên giao diện.
2. `.\deploy\scripts\restore.ps1 -File E:\MedAssistBackup\<file vừa tạo>.dump`, gõ `KHOIPHUC`.
3. Mở `https://<máy chủ>/health` (`database.ok = true`), đăng nhập trên một máy client, so lại số liệu ở bước 1.
4. Ghi ngày thử, tên file, kết quả vào biên bản. CSDL cũ còn giữ tên `medassist_truoc_<thời điểm>`; xóa khi chắc chắn không cần:
   `... exec db psql -U medassist_owner -d postgres -c "DROP DATABASE medassist_truoc_<thời điểm>"`.

## Kết nối qua Tailscale

Dùng khi các máy không chung một mạng, vd mỗi máy dùng dữ liệu di động riêng hoặc thử từ xa. Khi các máy chung một mạng có
Internet, Tailscale tự nối thẳng qua mạng đó nên vẫn nhập cùng một địa chỉ. Tailscale tạo mạng riêng ảo mã hóa (WireGuard)
giữa các máy; ứng dụng vẫn đi HTTPS bằng CA của dự án như trong LAN. Cần Internet; mạng chung không có Internet thì dùng IP LAN.

1. **Tài khoản:** cả nhóm đăng nhập Tailscale bằng **một tài khoản chung** (cùng một tailnet). Trên trang quản trị Tailscale,
   giữ MagicDNS bật (mặc định) và **tắt hết hạn khóa (Disable key expiry)** cho máy admin để máy không rớt khỏi mạng giữa buổi.
2. **Máy admin:** cài Tailscale, đăng nhập, xem tên và IP: `tailscale status`, `tailscale ip -4`.
   Cấp chứng chỉ cho tên MagicDNS và IP đó (bước 2 ở trên) rồi `.\deploy\scripts\start.ps1`.
   Mở cổng 443 trong Windows Firewall (PowerShell quyền Administrator):
   `New-NetFirewallRule -DisplayName "MedAssist HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow`.
3. **Máy client:** cài Tailscale, đăng nhập cùng tài khoản, ở màn đăng nhập MedAssist bấm **Máy chủ** và nhập
   `https://<tên Tailscale của máy admin>`: tên ngắn (vd `https://medassist-server`) hoặc tên đầy đủ `...ts.net`; tên nào
   cũng phải có trong chứng chỉ. Đổi tên máy trên Tailscale thì phải cấp lại chứng chỉ và sửa ô Máy chủ trên mọi client.
4. **Kiểm tra đường đi:** trên client chạy `tailscale ping <tên máy admin>`. `via <IP>:<cổng>` là kết nối trực tiếp;
   `via DERP(...)` là đi qua máy chuyển tiếp của Tailscale (thường gặp với mạng di động), độ trễ cao hơn nhưng vẫn dùng được.
   Mở `https://<tên máy admin>/health` trên trình duyệt của client để chắc chứng chỉ và cổng 443 đều đúng.

Lưu ý: mọi máy client đều đi qua đường mạng của máy admin, nên máy admin cần sóng ổn định nhất. Mỗi máy dùng dữ liệu di động
riêng thì lưu lượng đi qua Internet (tốn dữ liệu, có thể qua máy chuyển tiếp); dữ liệu mỗi lần hỏi nhỏ (hàng đợi hỏi lại khoảng
2 giây một lần). Trong một mạng chung (kể cả điểm phát Wi-Fi), lưu lượng giữa các máy chỉ đi trong mạng đó, không tốn dữ liệu
di động. Không dùng `-OllamaLan` khi có máy ngoài nhóm trong tailnet.

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `start.ps1` báo thiếu `deploy\.env` hoặc thiếu chứng chỉ | Làm bước 1, 2 ở trên |
| `migrate` thoát lỗi, `api` không chạy | `... logs migrate`; thường do mật khẩu trong `.env` khác lúc tạo volume |
| Client báo lỗi chứng chỉ | IP máy admin đã đổi, hoặc bản cài thiếu `medassist-root-ca.crt`: cấp lại chứng chỉ đúng IP / build lại bản cài |
| Client không kết nối được | Kiểm tra cùng mạng, `ping` IP máy admin, Windows Firewall cho phép cổng 443 vào |
| Qua Tailscale không vào được | `tailscale status` trên cả hai máy (cùng tailnet, máy admin đang online); chứng chỉ phải có đúng tên MagicDNS đang nhập ở ô **Máy chủ** |
| Qua Tailscale chậm | `tailscale ping` báo `via DERP`: đổi sang mạng di động khác cho máy admin hoặc dùng phương án dự phòng ở mục Tailscale |
| `/health` có `ai.ok = false` | `... logs ollama`; model chưa tải xong hoặc thiếu VRAM. Luật cờ đỏ vẫn chạy, gợi ý AI về `Degraded` |
| Gợi ý AI đứng ở `Pending` lâu | `... logs -f worker`; mỗi ca có LLM mất khoảng 10–40 giây, worker xử lý lần lượt |
| Bác sĩ không thấy gợi ý AI | Chưa có bản tri thức Active: chạy lại bước 5 (`import_okf`) |

## Bảo mật

- `deploy\.env`, `deploy\certs\` (khóa riêng của CA) và `deploy\backups\` **không bao giờ commit**.
- Giữ một bản `medassist-root-ca.key` ngoài máy admin (USB cất riêng): mất khóa này thì phải tạo CA mới và cài lại app trên mọi máy client.
- Chỉ Caddy mở cổng ra LAN. Ollama không có xác thực, nên chỉ mở cổng 11434 (`-OllamaLan`) trong giai đoạn phát triển;
  **không dùng** trên máy demo, máy giao cho giảng viên, hoặc khi tailnet có máy ngoài nhóm.
- Sao lưu dùng vai trò chỉ đọc `medassist_backup`; API dùng `medassist_app`, không có quyền sửa / xóa nhật ký và sổ kho.
- Máy từng khôi phục bằng `restore.ps1` bản trước 01/11/2026 (`pg_restore --clean` trên CSDL đang chạy) đã bị cấp lại quyền
  UPDATE thừa. Thu hồi một lần:
  `... exec db psql -U medassist_owner -d medassist -c "REVOKE UPDATE, DELETE, TRUNCATE ON audit_log, stock_movement FROM medassist_app"`.
