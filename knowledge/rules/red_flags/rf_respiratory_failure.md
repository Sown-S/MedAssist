---
schema: okf_triage_rule_v1
rule_key: rf_respiratory_failure
rule_name: 'Cờ đỏ: Suy hô hấp cấp (SpO2 < 92% hoặc thở nhanh vượt ngưỡng theo lứa tuổi)'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_qd_1327_2014
source_edition: Quyết định số 1327/QĐ-BYT
reason_text: 'CẤP CỨU: Dấu hiệu suy hô hấp cấp (khó thở nặng, SpO2 < 92% hoặc nhịp thở vượt ngưỡng cấp cứu theo lứa tuổi: người lớn/trẻ lớn >= 30, trẻ 1-5 tuổi >= 40, nhũ nhi >= 50 lần/phút theo QĐ 1327/QĐ-BYT).'
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
  - op: AND
    args:
    - type: age
      unit: years
      cmp: '>='
      value: 12
    - type: vital
      vital: respiratory_rate_bpm
      cmp: '>='
      value: 30
  - op: AND
    args:
    - type: age
      unit: years
      cmp: '>='
      value: 1
    - type: age
      unit: years
      cmp: <
      value: 12
    - type: vital
      vital: respiratory_rate_bpm
      cmp: '>='
      value: 40
  - op: AND
    args:
    - type: age
      unit: years
      cmp: <
      value: 1
    - type: vital
      vital: respiratory_rate_bpm
      cmp: '>='
      value: 50
---

# Cờ đỏ: Suy hô hấp cấp (SpO2 < 92% hoặc thở nhanh vượt ngưỡng theo lứa tuổi)
CẤP CỨU: Dấu hiệu suy hô hấp cấp (khó thở nặng, SpO2 < 92% hoặc nhịp thở vượt ngưỡng cấp cứu theo lứa tuổi: người lớn/trẻ lớn >= 30, trẻ 1-5 tuổi >= 40, nhũ nhi >= 50 lần/phút theo QĐ 1327/QĐ-BYT).
