---
schema: okf_triage_rule_v1
rule_key: rf_shock_circulatory_failure
rule_name: 'Cờ đỏ: Sốc hoặc suy tuần hoàn cấp (Huyết áp tâm thu < 90 mmHg hoặc mạch
  > 120 lần/phút)'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_co_xuong_khop_2014
source_edition: Quyết định số 361/QĐ-BYT
reason_text: 'CẤP CỨU: Bệnh nhân có dấu hiệu sốc hoặc tụt huyết áp (HATT < 90 mmHg,
  mạch nhanh > 120 lần/phút), cần hồi sức tuần hoàn ngay.'
condition_logic:
  op: OR
  args:
  - type: symptom
    symptom_code: sym_shock_circulatory
    state: PRESENT
  - type: vital
    vital: systolic_bp_mmhg
    cmp: <
    value: 90
  - type: vital
    vital: heart_rate_bpm
    cmp: '>'
    value: 120
---

# Cờ đỏ: Sốc hoặc suy tuần hoàn cấp (Huyết áp tâm thu < 90 mmHg hoặc mạch > 120 lần/phút)
CẤP CỨU: Bệnh nhân có dấu hiệu sốc hoặc tụt huyết áp (HATT < 90 mmHg, mạch nhanh > 120 lần/phút), cần hồi sức tuần hoàn ngay.
