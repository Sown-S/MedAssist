---
schema: okf_spec_v1
label: KB-2026.03
description: Đặc tả định dạng OKF, quy ước mã slug bất biến, 8 khóa sinh hiệu chuẩn,
  cấu trúc condition_logic và thứ tự nạp của MedAssist.
---

# ĐẶC TẢ ĐỊNH DẠNG OKF & MARKDOWN NẠP TRI THỨC LÂM SÀNG (MEDASSIST KB v1.0)

## 1. Quy ước Mã định danh (Slug), Tính Bất Biến & Tiền tố Luật
1. **Định dạng mã slug (`chk_*_code_format`)**:
   - Mọi khóa định danh gồm `symptom_code` (<= 50 ký tự), `condition_code` (<= 80 ký tự), `excerpt_key` (<= 80 ký tự), `source_key` (<= 50 ký tự) và `rule_key` (<= 80 ký tự) bắt buộc dùng chữ thường ASCII và dấu gạch dưới theo biểu thức chính quy: `^[a-z0-9]+(_[a-z0-9]+)*$`.
2. **Tính bất biến (Immutability sau khi Active)**:
   - Mã `symptom_code` (bảng `symptom_key`) và `condition_code` (bảng `condition_key`) **không đổi (bất biến)** sau khi bản phát hành tri thức (`knowledge_release`) đã được Bác sĩ duyệt sang trạng thái **`Active`**.
   - Khi ngừng sử dụng một mục tri thức, hệ thống chỉ chuyển trạng thái và tắt dây chuyền trong cùng một giao dịch (transaction), tuyệt đối không xóa vật lý hay đổi mã đã `Active`.
3. **Tiền tố bắt buộc của mã luật phân loại (`rule_key`)**:
   - **`rf_`**: Dành riêng cho luật Cờ đỏ (`rule_type: "RED_FLAG"`, `resulting_priority: "Emergency"`), đặt trong `rules/red_flags/rf_*.md`.
   - **`pf_`**: Dành riêng cho luật Sàn ưu tiên cao (`rule_type: "PRIORITY_FLOOR"`, `resulting_priority: "HighPriority"`), đặt trong `rules/priority_floors/pf_*.md` (ví dụ: `pf_sot_cao.md`).

## 2. Cấu trúc `condition_logic`, Lá `symptom_code`, Lá `vital` & 8 Khóa Sinh Hiệu Chuẩn
Trường `condition_logic` trong các file luật `rf_*.md` và `pf_*.md` biểu diễn cây biểu thức logic 3 giá trị Kleene mạnh (`TRUE`, `FALSE`, `UNKNOWN`) với độ sâu tối đa 5 tầng:

### 2.1. Nút tổ hợp (`AND` / `OR` / `NOT`)
- `op`: Nhận giá trị `"AND"`, `"OR"` hoặc `"NOT"`.
- `args`: Danh sách không rỗng các nút con (Nút tổ hợp hoặc Nút lá).

### 2.2. Lá `symptom_code` và Lá `vital` trong `condition_logic`
1. **Lá Triệu chứng (`type: "symptom"`)**:
   - `type`: `"symptom"`
   - `symptom_code`: Mã slug triệu chứng bắt buộc tồn tại trong `symptoms/symptom_catalog.md`.
   - `state`: Trạng thái kiểm tra, nhận `"PRESENT"` hoặc `"ABSENT"`.
2. **Lá Sinh hiệu (`type: "vital"`)**:
   - `type`: `"vital"`
   - `vital`: Chỉ nhận một trong **8 khóa sinh hiệu chuẩn** đồng bộ với hàm `fn_vital_sign_keys()` trong CSDL và `vital_signs.schema.json`:
     1. `temperature_c` — Nhiệt độ cơ thể (°C)
     2. `heart_rate_bpm` — Nhịp tim / Mạch (lần/phút)
     3. `respiratory_rate_bpm` — Nhịp thở (lần/phút)
     4. `systolic_bp_mmhg` — Huyết áp tâm thu (mmHg)
     5. `diastolic_bp_mmhg` — Huyết áp tâm trương (mmHg)
     6. `spo2_pct` — Độ bão hòa oxy máu ngoại vi SpO2 (%)
     7. `weight_kg` — Cân nặng (kg)
     8. `height_cm` — Chiều cao (cm)
   - `cmp`: Toán tử so sánh thuộc tập `["<", "<=", ">", ">=", "=="]`.
   - `value`: Giá trị số hữu hạn (`int` hoặc `float`).
3. **Lá Nhóm tuổi (`type: "age"`)**:
   - `type`: `"age"`
   - `unit`: Nhận `"years"` (năm tuổi) hoặc `"months"` (tháng tuổi).
   - `cmp`: Toán tử so sánh thuộc tập `["<", "<=", ">", ">=", "=="]`.
   - `value`: Giá trị số hữu hạn.
   - **Tách ngưỡng sinh hiệu theo lứa tuổi**: Kết hợp `AND` giữa lá `type: "age"` (nhũ nhi `< 1` tuổi, trẻ nhỏ `1 - 12` tuổi, trẻ lớn & người lớn `>= 12` tuổi) với các lá `vital` (`heart_rate_bpm`, `respiratory_rate_bpm`, `systolic_bp_mmhg`) theo hướng dẫn Bộ Y tế để trẻ nhũ nhi (nhịp tim sinh lý 120–160 lần/phút) không bị gắn cờ đỏ sai.

## 3. Thứ tự Nạp Tri thức vào Cơ sở dữ liệu (`import_okf.py`)
Để đảm bảo toàn vẹn khóa ngoại (`FOREIGN KEY`) và kiểm tra tính đóng qua `v_knowledge_integrity_issues`, trình nạp (`server/scripts/import_okf.py`) bắt buộc nạp theo thứ tự **triệu chứng và bệnh trước, quan hệ sau** trong cùng một giao dịch (transaction):
1. **Bước 1 — Nạp Nguồn, Triệu chứng và Bệnh trước**:
   - Khởi tạo bản phát hành `knowledge_release` (`Draft`).
   - Nạp danh mục nguồn tài liệu (`sources/*.md` -> `knowledge_source`).
   - Nạp danh mục triệu chứng (`symptoms/symptom_catalog.md` -> `symptom_key` và `symptom`).
   - Nạp danh mục bệnh lý (`conditions/<disease_group>/*.md` -> `condition_key` và `condition`).
2. **Bước 2 — Nạp Quan hệ, Đoạn trích và Luật sau**:
   - Nạp quan hệ bệnh - triệu chứng (`relations` -> `condition_symptom`) sau khi cả triệu chứng và bệnh đã tồn tại.
   - Nạp đoạn trích hướng dẫn chẩn đoán (`excerpts` -> `guideline_excerpt`).
   - Nạp các luật phân loại (`rules/red_flags/rf_*.md` và `rules/priority_floors/pf_*.md` -> `triage_rule`).
