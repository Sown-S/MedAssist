# Hướng dẫn demo và kiểm thử AI

Chuẩn bị buổi demo / bảo vệ và kiểm tra module AI trên máy admin. Cài đặt máy chủ: [`deploy/README.md`](../deploy/README.md).
Kiểm thử trên một máy với dữ liệu mẫu (giảng viên): [`huong-dan-kiem-thu.md`](huong-dan-kiem-thu.md).
Số đo chính thức cho báo cáo dùng bộ test đóng băng ở [`evaluation/testset/`](../evaluation/testset/README.md), không dùng ca demo.

## 1. Chuẩn bị (trước buổi demo 1 ngày)

1. Kéo `develop` mới nhất, `.\deploy\scripts\start.ps1`. Mở `https://<IP máy admin>/health`: `database.ok` và `ai.ok` phải là `true`.
2. Kiểm tra bản tri thức Active ở **Quản trị › Cấu hình AI** đúng số bệnh của `knowledge/` hiện tại (199 bệnh, 97 triệu chứng, 12 luật).
   Nhãn bản phát hành không tự đổi theo nội dung, nên so số lượng chứ không so nhãn.
3. Tài khoản: 1 Quản trị, 1–2 Bác sĩ đã **gắn phòng**, 1 Lễ tân; đăng nhập thử từng tài khoản và đổi mật khẩu lần đầu xong trước buổi demo.
4. Kho: nếu cần kho mẫu, `exec api python -m scripts.seed_drugs` (có lô ban đầu); nếu đã nạp `--no-batches` thì nhập vài lô ở màn Kho.
5. Máy client: cài bản `MedAssist Setup`, đặt địa chỉ máy chủ, kiểm tra không báo lỗi chứng chỉ.
6. Sao lưu ngay trước buổi demo: `.\deploy\scripts\backup.ps1`.
7. Lần gọi LLM đầu tiên sau khi bật máy chậm hơn (nạp model vào VRAM): chạy thử 1–2 ca trước khi hội đồng vào.

## 2. Kịch bản demo gợi ý (15–20 phút)

| # | Vai trò | Làm gì | Điểm cần nói |
|---|---|---|---|
| 1 | Lễ tân | Đăng ký bệnh nhân, nhập lời kể, bấm **Đề xuất triệu chứng**, xác nhận chip, nhập sinh hiệu | Human-in-the-loop: AI chỉ gợi ý, lễ tân xác nhận mới dùng |
| 2 | Lễ tân | Tiếp đón một ca có SpO2 88 hoặc lơ mơ | Cờ đỏ chạy ngay, không chờ LLM; ca lên đầu hàng chờ mức Cấp cứu |
| 3 | Lễ tân | Ca thiếu thông tin: xem mục **Hỏi ngay** | Luật logic ba trị chỉ ra dữ liệu còn thiếu để loại trừ nguy hiểm |
| 4 | Bác sĩ | Mời bệnh nhân, xem thẻ **Gợi ý tham khảo** chuyển từ *Đang phân tích* sang *Đầy đủ* | Top 3 có bằng chứng ủng hộ / phản bác / còn thiếu, lý do tiếng Việt, phiên bản tri thức |
| 5 | Bác sĩ | Chọn chẩn đoán, kê đơn, chốt đơn | Trừ kho FEFO một giao dịch; không đánh giá đơn thuốc (đúng phạm vi) |
| 6 | Lễ tân | Cấp phát, thu tiền, in hóa đơn | Lượt khám Hoàn tất |
| 7 | Quản trị | Báo cáo, nhật ký hoạt động, nhật ký AI | Nhật ký chỉ ghi thêm; quản trị không xem dữ liệu bệnh nhân |
| 8 | Quản trị + Bác sĩ | Tắt khẩn cấp một luật; soạn thay đổi, bác sĩ duyệt | Vòng đời tri thức: Admin soạn, Bác sĩ duyệt (khác người soạn) |
| 9 | (Tùy chọn) | `... stop ollama`, tiếp đón một ca mới, rồi `... start ollama` | AI lỗi thì ca về *Chỉ theo luật*, phòng khám vẫn chạy |

`...` là `docker compose -f deploy\docker-compose.yml --env-file deploy\.env`.

## 3. Nạp nhiều ca mẫu vào hàng đợi

`scripts.seed_eval` nạp ca mẫu (`server/data/eval_cases.jsonl`) đi đúng luồng màn Tiếp đón: tạo lượt, lưu triệu chứng, chạy
đánh giá, check-in. Hàng đợi chỉ tạo khi hôm nay chưa có lượt nào, nên dùng trên máy demo trống hoặc môi trường kiểm thử
(`deploy/docker-compose.eval.yml` tự chạy). Trên máy admin đã có dữ liệu thật, không chạy script này.

```powershell
$dc = "docker compose -f deploy\docker-compose.yml --env-file deploy\.env"
iex "$dc exec -e EVAL_PASSWORD=<mật khẩu> api python -m scripts.seed_eval --skip-knowledge"
```

- Script tạo tài khoản `admin`, `bs01`, `bs02`, `letan01` nếu chưa có, cùng lượt khám 14 ngày trước và 15 lượt hôm nay
  (2 cờ đỏ, 3 ưu tiên cao, ca đã khám xong, ca chờ thu tiền).
- Worker xử lý lần lượt từng ca có LLM, mỗi ca 10–40 giây; ca nạp sẵn có gợi ý đầy đủ sau vài phút.

## 4. Kiểm thử AI trên máy dev (không cần GPU)

```powershell
# server/.env: LLM_PROVIDER=fake  (LLM giả lập tất định, đủ luồng Ready/Full; cấm ở prod)
cd server
python -m pytest tests/unit/ai      # pipeline, luật, chấm điểm, trích xuất
uvicorn app.main:app --reload       # terminal 1
python -m app.worker                # terminal 2
```

`LLM_PROVIDER=none` để thử nhánh lỗi: mọi lần đánh giá kết thúc `Degraded` / `RuleOnly`.

## 5. Tiêu chí đạt khi kiểm thử trên app

| Kiểm tra | Đạt khi |
|---|---|
| Mức ưu tiên, cờ đỏ | Đúng luật kích hoạt (phần luật là tất định, không phụ thuộc LLM) |
| Thứ tự hàng đợi | Cấp cứu → Ưu tiên cao → Thường, trong cùng mức theo thời điểm tiếp đón |
| Trạng thái AI | Cờ đỏ → `Skipped`; không có triệu chứng "Có" → `Degraded` (không có ứng viên); còn lại → `Ready`. `Degraded` do LLM quá giờ là lỗi môi trường, ghi lại và xem log worker |
| Gợi ý cuối | Chỉ gồm bệnh trong danh sách ứng viên theo luật; lý do tiếng Việt, dẫn đúng triệu chứng của ca |
| Ngưỡng cờ đỏ (Cấp cứu) | SpO2 < 92. Nhịp thở theo cân nặng: ≥ 30 (≥ 25 kg), ≥ 40 (10–25 kg), ≥ 50 (< 10 kg); thiếu cân nặng thì mục *Hỏi ngay* đòi cân nặng. Huyết áp tâm thu / mạch theo tuổi: ≥ 12 tuổi < 90 hoặc > 130; 1–12 tuổi < 80 hoặc > 150; < 1 tuổi < 70 hoặc > 170 |
| Ngưỡng sàn (Ưu tiên cao) | Nhiệt độ ≥ 38,5°C (`pf_sot_cao`); mất nước nặng, hoặc sốt cao kèm chấm xuất huyết; ho ra máu / nôn ra máu / phân đen |
| Giá trị đúng bằng ngưỡng | SpO2 92, mạch 130 (người lớn) không kích hoạt; nhiệt độ 38,5°C và nhịp thở 30 có kích hoạt (so sánh ≥) |

## 6. Giới hạn đã biết (nên chủ động nói khi demo)

- Ngưỡng nhịp thở dựa trên cân nặng (không theo tuổi), nên ca thiếu cân nặng phải hỏi thêm trước khi vào hàng chờ.
- Một số bệnh cần xử trí sớm (uốn ván chưa co giật, viêm màng não còn tỉnh, viêm nắp thanh quản) chưa có luật cờ đỏ riêng; ra mức Thường nếu sốt dưới 38,5°C.
- Kho tri thức trích xuất tự động từ văn bản Bộ Y tế, một số quan hệ triệu chứng chưa được bác sĩ rà soát; đây là lý do gợi ý chỉ để tham khảo.
- AI không gợi ý thuốc và hệ thống không đánh giá đơn thuốc (phạm vi Proposal v2.0).
