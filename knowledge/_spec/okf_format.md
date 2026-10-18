---
schema: okf_spec_v1
label: KB-2026.01
description: Đặc tả định dạng OKF và ràng buộc toàn vẹn của bộ tri thức lâm sàng MedAssist.
---

# ĐẶC TẢ ĐỊNH DẠNG OKF & MARKDOWN NẠP TRI THỨC LÂM SÀNG (MEDASSIST KB v1.0)

## 1. Cấu trúc thư mục chuẩn của `okf_vault/`
- `_release.md`: Metadata của bản phát hành tri thức (`knowledge_release`).
- `sources/*.md`: Danh mục tài liệu nguồn của Bộ Y tế (`knowledge_source`). Có cả `source_key` (để liên kết giữa các file Markdown và kiểm tra với `check_okf.py`) và `edition` (Số quyết định, ví dụ `"Quyết định số 361/QĐ-BYT"`, dùng làm khóa tự nhiên ổn định để tra cứu trong bảng `knowledge_source` khi chạy `import_okf.py`).
- `symptoms/symptom_catalog.md`: Danh mục triệu chứng nguyên tử chuẩn hóa (`symptom` & `symptom_key`).
- `conditions/<disease_group>/<condition_code>.md`: Đặc tả bệnh lý (`condition`), quan hệ triệu chứng (`condition_symptom`) và đoạn trích phác đồ (`guideline_excerpt`).
- `rules/red_flags/rf_*.md`: Chỉ chứa các file luật Cờ đỏ (`rule_type: RED_FLAG`, `resulting_priority: Emergency`).
- `rules/priority_floors/pf_*.md`: Chỉ chứa các file luật Sàn ưu tiên cao (`rule_type: PRIORITY_FLOOR`, `resulting_priority: HighPriority`).
- `exports/`: Chứa các file báo cáo đối soát CSV/JSON (không nạp vào CSDL).

## 2. Ràng buộc toàn vẹn với CSDL PostgreSQL (Database Design v1.4)
1. **Định dạng mã slug (`chk_*_code_format`)**: Mọi `symptom_code` (<= 50 ký tự), `condition_code` (<= 80 ký tự), `excerpt_key` (<= 80 ký tự) phải khớp biểu thức chính quy `^[a-z0-9]+(_[a-z0-9]+)*$`.
2. **Tiền tố mã luật (`chk_triage_rule_key_format` & `chk_triage_rule_type_priority`)**:
   - Luật `RED_FLAG` phải có `rule_key` bắt đầu bằng `rf_` và `resulting_priority: "Emergency"`.
   - Luật `PRIORITY_FLOOR` phải có `rule_key` bắt đầu bằng `pf_` và `resulting_priority: "HighPriority"`.
3. **Tính đóng của tập tri thức (`v_knowledge_integrity_issues`)**:
   - Mọi `symptom_code` xuất hiện trong `relations` của bệnh hoặc trong `condition_logic` của luật đều phải tồn tại trong `symptoms/symptom_catalog.md`.
   - Mọi khóa `vital` trong `condition_logic` chỉ được thuộc 8 khóa chuẩn của `fn_vital_sign_keys()`: `temperature_c`, `heart_rate_bpm`, `respiratory_rate_bpm`, `systolic_bp_mmhg`, `diastolic_bp_mmhg`, `spo2_pct`, `weight_kg`, `height_cm`.
