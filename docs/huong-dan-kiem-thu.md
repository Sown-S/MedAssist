# Hướng dẫn kiểm thử MedAssist

Dành cho giảng viên và người kiểm thử ngoài nhóm. Toàn bộ hệ thống chạy trên **một máy** Windows, macOS hoặc Linux:
máy chủ (CSDL, API, worker AI) trong Docker, ứng dụng desktop trên chính máy đó. Lần đầu mất khoảng 15–30 phút, phần lớn là tải
image và thư viện.

> Đây là môi trường kiểm thử: mật khẩu mẫu, API chỉ mở ở `127.0.0.1`, dữ liệu bệnh nhân là dữ liệu giả.
> Cách triển khai cho phòng khám thật (HTTPS, nhiều máy trong LAN, GPU) ở [`deploy/README.md`](../deploy/README.md).

## 1. Cần có trên máy

| Công cụ | Ghi chú |
|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Đang chạy trước khi gõ lệnh. Linux: Docker Engine + Compose v2.24 trở lên |
| [Node.js](https://nodejs.org/) 20 hoặc 22 LTS | Chỉ cần khi chạy ứng dụng từ mã nguồn (cách A ở mục 3) |
| Git | Hoặc tải file zip mã nguồn ở trang Releases |
| Ổ đĩa trống ~5 GB, RAM 8 GB | Thêm ~6 GB ổ đĩa và RAM 16 GB nếu bật LLM thật (mục 6) |

## 2. Bật máy chủ

Mở Terminal (macOS, Linux) hoặc PowerShell (Windows) tại thư mục muốn để mã nguồn:

```bash
git clone https://github.com/Sown-S/MedAssist.git
cd MedAssist
docker compose -f deploy/docker-compose.eval.yml --env-file deploy/eval.env up -d --build
```

Lệnh `up` tự làm theo thứ tự: tạo CSDL → chạy migration → nạp dữ liệu mẫu → bật API và worker AI. Lần đầu build image mất
5–10 phút. Kiểm tra: mở <http://127.0.0.1:8000/health> trên trình duyệt, phải thấy `"database": {"ok": true}`.
`"ai": {"ok": false, "detail": "LLM đang tắt…"}` là bình thường ở chế độ mặc định (mục 6).

| Việc | Lệnh (chạy tại thư mục `MedAssist`) |
|---|---|
| Xem trạng thái | `docker compose -f deploy/docker-compose.eval.yml --env-file deploy/eval.env ps` |
| Xem log nạp dữ liệu / API / worker | `… logs seed`, `… logs -f api`, `… logs -f worker` |
| Tắt (giữ dữ liệu) | `… stop` |
| Xóa sạch, làm lại từ đầu | `… down -v` rồi chạy lại lệnh `up` ở trên |

`…` là `docker compose -f deploy/docker-compose.eval.yml --env-file deploy/eval.env`.

## 3. Mở ứng dụng desktop

**Cách A – từ mã nguồn (mọi hệ điều hành, khuyên dùng):**

```bash
cd client
npm ci          # lần đầu, tải cả Electron (~100 MB)
npm run eval    # build rồi mở cửa sổ MedAssist
```

**Cách B – bản cài sẵn** ở trang [Releases](https://github.com/Sown-S/MedAssist/releases) (cùng phiên bản với mã nguồn):

- Windows: `MedAssist-Setup-<phiên bản>.exe`. Bản cài chưa ký số nên SmartScreen cảnh báo: bấm **More info › Run anyway**.
- macOS: `MedAssist-<phiên bản>-arm64.dmg` (chip Apple M) hoặc `-x64.dmg` (chip Intel). Kéo vào Applications, rồi chạy
  `xattr -cr /Applications/MedAssist.app` trong Terminal (macOS chặn ứng dụng chưa ký số và báo "bị hỏng").

Cả hai cách đều nối sẵn `http://127.0.0.1:8000`. Nếu màn đăng nhập báo không kết nối được, kiểm tra lại mục 2.

Giao diện mặc định là tiếng Anh: chọn **Tiếng Việt** ở màn đăng nhập (sau khi đăng nhập: nút **Settings** góc trên › **Language**).
Tên nút và màn hình trong hướng dẫn này theo giao diện tiếng Việt.

**Mở nhiều vai trò cùng lúc** (lễ tân, bác sĩ, quản trị mỗi người một cửa sổ): mỗi cửa sổ dùng một hồ sơ riêng.

```bash
npm run eval -- -- --profile=letan        # cửa sổ 1 (cách A); thêm cửa sổ:
npx electron-vite preview --mode eval --skipBuild -- --profile=bacsi
```

Bản cài (cách B): tạo shortcut tới `MedAssist.exe` và thêm `--profile=bacsi` vào ô Target. Không dùng hồ sơ thì đăng xuất rồi đăng
nhập vai trò khác trên cùng cửa sổ.

## 4. Tài khoản và dữ liệu có sẵn

Mật khẩu chung: **`Kiemthu@2026`** (đổi được trong `deploy/eval.env` trước lần `up` đầu tiên).

| Tài khoản | Vai trò | Ghi chú |
|---|---|---|
| `letan01` | Lễ tân | Tiếp đón, check-in, gọi bệnh nhân, cấp phát, thu tiền, kho |
| `bs01` | Bác sĩ, Phòng khám 01 | Đang có 1 bệnh nhân trong phòng (số 003) |
| `bs02` | Bác sĩ, Phòng khám 02 | Duyệt được bản tri thức do Quản trị soạn |
| `admin` | Quản trị | Không xem được dữ liệu bệnh nhân (thiết kế bảo vệ dữ liệu) |

Dữ liệu nạp sẵn:

- Danh mục: 386 thuốc có lô (3 lô hết hạn sau 20 ngày, 3 thuốc dưới ngưỡng tồn), 28 dịch vụ và xét nghiệm, 3 gói khám,
  374 cơ sở nhận chuyển tuyến, bản tri thức Active (199 bệnh, 97 triệu chứng, 12 luật).
- Lượt khám cũ trong 2–3 tuần trước ngày nạp: 34 lượt, gồm 31 lượt đã xong (có chẩn đoán, đơn thuốc, hóa đơn), 2 lượt chuyển
  tuyến, 1 lượt hủy.
  Báo cáo, lịch sử khám, danh sách đơn thuốc theo tuần/tháng có số liệu ngay.
- **Hàng đợi hôm nay** (15 lượt): số 001 đã xong, 002 chờ cấp phát và thu tiền, 003 bác sĩ `bs01` đang khám, 004–005 cờ đỏ
  (Cấp cứu), 006–010 đã check-in, 011–015 chờ check-in. Bệnh nhân số 001, 002, 003 và 008 có lượt khám cũ để xem lịch sử.

Hàng đợi chỉ tạo khi hôm nay chưa có lượt nào. Kiểm thử sang ngày khác thì chạy lại lệnh `up` (dịch vụ `seed` tự tạo hàng đợi
mới); lượt chưa xong của hôm trước hiện ở hộp **Lượt chưa đóng từ những ngày trước** của Lễ tân.

## 5. Kịch bản kiểm thử gợi ý

Kết quả mong đợi theo luật của bản tri thức trong thư mục `knowledge/rules/`.

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | Bất kỳ | Đăng nhập sai mật khẩu 5 lần, rồi đăng nhập đúng | Tài khoản bị khóa tạm 5 phút; `admin` mở khóa ở **Quản trị › Quản lý tài khoản** |
| 2 | Quản trị | Tạo tài khoản lễ tân mới, đăng nhập bằng tài khoản đó | Bắt buộc đổi mật khẩu trước khi làm việc khác |
| 3 | Lễ tân | **+ Đăng ký bệnh nhân mới** (F2), nhập lời kể, triệu chứng Có / Không / Chưa rõ, sinh hiệu | Lượt khám có số thứ tự, mức ưu tiên hiện ngay |
| 4 | Lễ tân | Tiếp đón người lớn có SpO2 = 88 | Cờ đỏ, mức **Cấp cứu**, đứng đầu hàng chờ; gợi ý AI ở trạng thái Bỏ qua |
| 5 | Lễ tân | Nhiệt độ 38,5°C (không có triệu chứng nguy hiểm) | **Ưu tiên cao**; 38,4°C thì **Thường** |
| 6 | Lễ tân | Người lớn nhịp thở 32, không nhập cân nặng | Mục **Hỏi ngay** đòi cân nặng (ngưỡng nhịp thở tính theo cân nặng) |
| 7 | Lễ tân | Check-in bệnh nhân số 011 | Chuyển sang nhóm đã check-in, bác sĩ mời được |
| 8 | Bác sĩ `bs02` | **Mời bệnh nhân tiếp theo** | Mời người có mức ưu tiên cao nhất đã check-in; màn Lễ tân hiện "Mời số … vào Phòng khám 02" |
| 9 | Bác sĩ `bs02` | Nhận khám, xem thẻ **Gợi ý tham khảo** | Tối đa 3 bệnh, có bằng chứng ủng hộ / phản bác / còn thiếu; nhãn *Chỉ theo luật* khi LLM tắt |
| 10 | Bác sĩ | Chọn chẩn đoán (ô ICD-10 tra theo bản tri thức), kê đơn, **Chốt đơn** (Ctrl+Enter) | Kho trừ theo lô hết hạn sớm nhất; lượt chuyển sang chờ thu tiền |
| 11 | Bác sĩ | Kê số lượng lớn hơn tồn kho rồi chốt | Bị chặn, liệt kê thuốc thiếu và lý do; kho không bị trừ |
| 12 | Bác sĩ | **Chỉ định xét nghiệm** (Alt+L), in phiếu, nhập kết quả khi bệnh nhân quay lại | Phí xét nghiệm tự vào hóa đơn |
| 13 | Bác sĩ | Mở **Giấy chuyển tuyến**, gõ tên bệnh viện | Gợi ý từ danh mục cơ sở; lượt khám kết thúc, không lập hóa đơn |
| 14 | Lễ tân | Bệnh nhân số 002: **Cấp phát & thu tiền** | Cấp từng dòng hoặc cấp hết, thu tiền mặt / chuyển khoản, in hóa đơn; lượt Hoàn tất |
| 15 | Bác sĩ | **Hồ sơ bệnh nhân**, tìm bệnh nhân số 001 | Thấy lượt khám cũ: chẩn đoán, sinh hiệu, đơn thuốc |
| 16 | Lễ tân / Quản trị | **Tồn kho & hạn dùng** | Cảnh báo lô sắp hết hạn và thuốc dưới ngưỡng; nhập lô mới |
| 17 | Quản trị → Bác sĩ | **Cấu hình AI**: soạn sửa một mục tri thức, gửi duyệt; `bs02` duyệt ở **Duyệt tri thức** | Bản mới Active; người soạn không tự duyệt được |
| 18 | Quản trị | **Cấu hình AI** › tắt khẩn cấp một luật | Luật ngừng áp dụng ngay cho ca tiếp đón sau |
| 19 | Quản trị | **Báo cáo**, **Lịch sử hoạt động** | Doanh thu, số lượt, tỉ lệ AI khớp chẩn đoán; nhật ký có mọi lượt xem / sửa |
| 20 | Bất kỳ | `… stop api` trong lúc app đang mở, rồi `… start api` | Trong vài giây app hiện băng **mất kết nối**, khóa mọi nút ghi; có lại thì tự mở |

## 6. Bật LLM thật (tùy chọn)

Mặc định AI chỉ xếp hạng theo luật (`Chỉ theo luật`), không cần GPU. Để có lời giải thích của mô hình Gemma-SEA-LION 9B:

1. Cài [Ollama](https://ollama.com/download) cho hệ điều hành của máy (dùng GPU NVIDIA trên Windows / Linux, chip Apple M trên macOS).
2. Tải model (~5,8 GB): `ollama pull hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`
3. Trong `deploy/eval.env` đổi `EVAL_LLM_PROVIDER=ollama`, rồi chạy lại lệnh `up` ở mục 2.

Kiểm tra `/health` phải có `"ai": {"ok": true}`. Mỗi ca mất 10–40 giây tùy máy; máy chỉ có CPU thường quá 90 giây và ca đó
về *Chỉ theo luật*. Chỉ ca tiếp đón sau khi bật mới có gợi ý của LLM. Tính năng **Đề xuất triệu chứng từ lời kể** cũng cần LLM;
khi tắt, lễ tân chọn triệu chứng từ danh sách.

## 7. Giới hạn đã biết

- Gợi ý AI chỉ để tham khảo; hệ thống không kiểm tra tương tác hay liều thuốc (phạm vi đề tài).
- Kho tri thức trích tự động từ văn bản Bộ Y tế; một số quan hệ triệu chứng – bệnh chưa được bác sĩ rà soát.
- Xét nghiệm làm ngoài hệ thống: bác sĩ nhập kết quả từ phiếu giấy.
- Hóa đơn đã thu không hủy được; không có lịch hẹn, BHYT, giảm giá.
- Lượt khám cũ được tạo bằng script rồi dời ngày: nhật ký hoạt động và thẻ kho của chúng mang giờ lúc nạp dữ liệu.

## 8. Báo lỗi

Ghi lại thao tác, thời điểm, tài khoản và **mã yêu cầu** (`request_id`) hiện trong thông báo lỗi, kèm log:
`docker compose -f deploy/docker-compose.eval.yml --env-file deploy/eval.env logs api worker > medassist-log.txt`.
Gửi cho nhóm C1SE.28 (trưởng nhóm: Võ Nguyễn Trung Sơn, sonvong.10.11@gmail.com).
