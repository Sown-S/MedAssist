---
schema: okf_triage_rule_v1
rule_key: rf_respiratory_failure
rule_name: 'Cờ đỏ: Suy hô hấp cấp (Khó thở nặng, SpO2 < 92% hoặc nhịp thở >= 30 lần/phút)'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_qd_1327_2014
source_edition: Quyết định số 1327/QĐ-BYT
reason_text: 'CẤP CỨU: Bệnh nhân có dấu hiệu suy hô hấp cấp (khó thở nặng, SpO2 <
  92% hoặc nhịp thở >= 30 lần/phút), cần hỗ trợ hô hấp ngay.'
condition_logic:
  op: OR
  args:
  - type: symptom
    symptom_code: sym_respiratory_failure
    state: PRESENT
  - type: vital
    vital: spo2_pct
    cmp: <
    value: 92
  - type: vital
    vital: respiratory_rate_bpm
    cmp: '>='
    value: 30
---

# Cờ đỏ: Suy hô hấp cấp (Khó thở nặng, SpO2 < 92% hoặc nhịp thở >= 30 lần/phút)
CẤP CỨU: Bệnh nhân có dấu hiệu suy hô hấp cấp (khó thở nặng, SpO2 < 92% hoặc nhịp thở >= 30 lần/phút), cần hỗ trợ hô hấp ngay.
