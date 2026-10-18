---
schema: okf_triage_rule_v1
rule_key: rf_seizures
rule_name: 'Cờ đỏ: Co giật toàn thân hoặc khu trú'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_co_xuong_khop_2014
source_edition: Quyết định số 361/QĐ-BYT
reason_text: 'CẤP CỨU: Bệnh nhân có cơn co giật cấp tính, cần xử trí bảo vệ đường
  thở và cắt cơn co giật ngay lập tức.'
condition_logic:
  type: symptom
  symptom_code: sym_seizures
  state: PRESENT
---

# Cờ đỏ: Co giật toàn thân hoặc khu trú
CẤP CỨU: Bệnh nhân có cơn co giật cấp tính, cần xử trí bảo vệ đường thở và cắt cơn co giật ngay lập tức.
