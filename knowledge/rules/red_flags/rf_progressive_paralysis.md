---
schema: okf_triage_rule_v1
rule_key: rf_progressive_paralysis
rule_name: 'Cờ đỏ: Yếu liệt chi tiến triển nhanh'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_co_xuong_khop_2014
source_edition: Quyết định số 361/QĐ-BYT
reason_text: 'CẤP CỨU: Bệnh nhân có yếu liệt chi tiến triển nhanh hoặc liệt hai chi
  dưới, cần khám cấp cứu thần kinh - cột sống ngay.'
condition_logic:
  type: symptom
  symptom_code: sym_progressive_paralysis
  state: PRESENT
---

# Cờ đỏ: Yếu liệt chi tiến triển nhanh
CẤP CỨU: Bệnh nhân có yếu liệt chi tiến triển nhanh hoặc liệt hai chi dưới, cần khám cấp cứu thần kinh - cột sống ngay.
