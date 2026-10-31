---
schema: okf_triage_rule_v1
rule_key: rf_respiratory_failure
rule_name: 'Cờ đỏ: Suy hô hấp cấp (SpO2 < 92% hoặc thở nhanh vượt ngưỡng theo lứa
  tuổi/cân nặng)'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_qd_1327_2014
source_edition: Quyết định số 1327/QĐ-BYT
reason_text: 'CẤP CỨU: Dấu hiệu suy hô hấp cấp (khó thở nặng, SpO2 < 92% hoặc nhịp
  thở vượt ngưỡng cấp cứu theo lứa tuổi tại Phụ lục QĐ 1327/QĐ-BYT: nhũ nhi < 1 tuổi
  >= 50, trẻ nhỏ 1-5 tuổi >= 40, trẻ lớn & người lớn >= 30 lần/phút).'
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
    - type: vital
      vital: weight_kg
      cmp: '>='
      value: 25
    - type: vital
      vital: respiratory_rate_bpm
      cmp: '>='
      value: 30
  - op: AND
    args:
    - type: vital
      vital: weight_kg
      cmp: '>='
      value: 10
    - type: vital
      vital: weight_kg
      cmp: <
      value: 25
    - type: vital
      vital: respiratory_rate_bpm
      cmp: '>='
      value: 40
  - op: AND
    args:
    - type: vital
      vital: weight_kg
      cmp: <
      value: 10
    - type: vital
      vital: respiratory_rate_bpm
      cmp: '>='
      value: 50
---

# Cờ đỏ: Suy hô hấp cấp (SpO2 < 92% hoặc thở nhanh vượt ngưỡng theo lứa tuổi/cân nặng)
CẤP CỨU: Dấu hiệu suy hô hấp cấp (khó thở nặng, SpO2 < 92% hoặc nhịp thở vượt ngưỡng cấp cứu theo lứa tuổi tại Phụ lục QĐ 1327/QĐ-BYT: nhũ nhi < 1 tuổi >= 50, trẻ nhỏ 1-5 tuổi >= 40, trẻ lớn & người lớn >= 30 lần/phút).
