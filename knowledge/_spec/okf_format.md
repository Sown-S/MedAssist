---
schema: okf_spec_v1
label: KB-2026.01
description: Đặc tả định dạng OKF, quy ước mã slug, 8 khóa sinh hiệu và cấu trúc condition_logic
  của MedAssist.
---

# ĐẶC TẢ ĐỊNH DẠNG OKF & MARKDOWN NẠP TRI THỨC LÂM SÀNG (MEDASSIST KB v1.0)

## 1. Cấu trúc thư mục chuẩn của `knowledge/` (Obsidian Vault)
- `_spec/okf_format.md`: Tài liệu đặc tả định dạng OKF, quy ước mã slug, 8 khóa sinh hiệu chuẩn và cấu trúc cây `condition_logic`.
- `_release.md`: Metadata của bản phát hành tri thức (`knowledge_release`).
- `sources/*.md`: Danh mục tài liệu nguồn của Bộ Y tế (`knowledge_source`). Có cả `source_key` và `edition`.
- `symptoms/symptom_catalog.md`: Danh mục triệu chứng nguyên tử chuẩn hóa (`symptom` & `symptom_key`).
- `conditions/<disease_group>/<condition_code>.md`: Đặc tả bệnh lý (`condition`), quan hệ triệu chứng (`condition_symptom`) và đoạn trích phác đồ (`guideline_excerpt`).
- `rules/red_flags/rf_*.md`: Chỉ chứa các file luật Cờ đỏ (`rule_type: RED_FLAG`, `resulting_priority: Emergency`).
- `rules/priority_floors/pf_*.md`: Chỉ chứa các file luật Sàn ưu tiên cao (`rule_type: PRIORITY_FLOOR`, `resulting_priority: HighPriority`).

## 2. Ràng buộc toàn vẹn với CSDL PostgreSQL (Database Design v1.4)
1. **Định dạng mã slug (`chk_*_code_format`)**: Mọi `symptom_code` (<= 50 ký tự), `condition_code` (<= 80 ký tự), `excerpt_key` (<= 80 ký tự) phải khớp biểu thức chính quy `^[a-z0-9]+(_[a-z0-9]+)*$`.
2. **Tiền tố mã luật (`chk_triage_rule_key_format` & `chk_triage_rule_type_priority`)**:
   - Luật `RED_FLAG` phải có `rule_key` bắt đầu bằng `rf_` và `resulting_priority: "Emergency"`.
   - Luật `PRIORITY_FLOOR` phải có `rule_key` bắt đầu bằng `pf_` và `resulting_priority: "HighPriority"`.
3. **Tính đóng của tập tri thức (`v_knowledge_integrity_issues`)**:
   - Mọi `symptom_code` xuất hiện trong `relations` của bệnh hoặc trong `condition_logic` của luật đều phải tồn tại trong `symptoms/symptom_catalog.md`.
   - Mọi khóa `vital` trong `condition_logic` chỉ được thuộc 8 khóa chuẩn của `fn_vital_sign_keys()`:
     1. `temperature_c` (Nhiệt độ cơ thể - °C)
     2. `heart_rate_bpm` (Nhịp tim / Mạch - lần/phút)
     3. `respiratory_rate_bpm` (Nhịp thở - lần/phút)
     4. `systolic_bp_mmhg` (Huyết áp tâm thu - mmHg)
     5. `diastolic_bp_mmhg` (Huyết áp tâm trương - mmHg)
     6. `spo2_pct` (Độ bão hòa oxy máu ngoại vi SpO2 - %)
     7. `weight_kg` (Cân nặng - kg)
     8. `height_cm` (Chiều cao - cm)

## 3. Đặc tả Cấu trúc Cây Biểu thức `condition_logic` (Bảng `triage_rule`)
Trường `condition_logic` trong các file luật `rf_*.md` và `pf_*.md` được lưu vào cột `triage_rule.condition_logic` (`JSONB`), được kiểm tra hợp lệ bởi `knowledge_validators.py` và đánh giá bởi `condition_evaluator.py` (Node 1) theo **logic 3 giá trị Kleene mạnh (`TRUE`, `FALSE`, `UNKNOWN`)** với độ sâu lồng tối đa **5 tầng** (`_MAX_DEPTH = 5`):

### 3.1. Nút tổ hợp (`AND` / `OR`)
- Gồm 2 trường bắt buộc:
  - `op`: Nhận giá trị `"AND"` hoặc `"OR"`.
  - `args`: Danh sách không rỗng (chứa từ **1 nút con trở lên**, mỗi phần tử là một Nút tổ hợp hoặc Nút lá).

### 3.2. Ba loại Nút lá điều kiện nguyên tử (`symptom`, `vital`, `age`)
1. **Nút lá Triệu chứng (`type: "symptom"`)**:
   - `type`: `"symptom"`
   - `symptom_code`: Chuỗi không rỗng, mã slug thuộc `symptom_catalog.md`.
   - `state`: Chỉ nhận `"PRESENT"` hoặc `"ABSENT"`.
2. **Nút lá Sinh hiệu (`type: "vital"`)**:
   - `type`: `"vital"`
   - `vital`: Một trong 8 khóa chuẩn của `fn_vital_sign_keys()`.
   - `cmp`: Toán tử so sánh thuộc tập `["<", "<=", ">", ">=", "=="]`.
   - `value`: Giá trị số hữu hạn (`int` hoặc `float`, không phải `bool`).
3. **Nút lá Tuổi (`type: "age"`)**:
   - `type`: `"age"`
   - `unit`: Đơn vị tính tuổi, **bắt buộc** chỉ nhận `"years"` hoặc `"months"` (tra cứu trường `age_years` hoặc `age_months`).
   - `cmp`: Toán tử so sánh thuộc tập `["<", "<=", ">", ">=", "=="]`.
   - `value`: Giá trị số hữu hạn (`int` hoặc `float`, không phải `bool`).
