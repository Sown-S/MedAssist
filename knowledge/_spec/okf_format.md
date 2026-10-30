---
schema: okf_spec_v1
label: KB-2026.03
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
