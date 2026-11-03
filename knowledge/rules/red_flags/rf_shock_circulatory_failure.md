---
schema: okf_triage_rule_v1
rule_key: rf_shock_circulatory_failure
rule_name: 'Cờ đỏ: Sốc hoặc suy tuần hoàn cấp (Tụt huyết áp hoặc mạch nhanh vượt ngưỡng theo tuổi)'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_qd_292_2024
source_edition: Quyết định số 292/QĐ-BYT
reason_text: 'CẤP CỨU: Dấu hiệu sốc/suy tuần hoàn (Ngưỡng trẻ em theo QĐ 292/QĐ-BYT mục II.6: nhũ nhi < 1 tuổi HATT < 70 mmHg hoặc mạch > 170, trẻ nhỏ 1-12 tuổi HATT < 80 hoặc mạch > 150; Ngưỡng người lớn theo QĐ 2699/QĐ-BYT: HATT < 90 hoặc mạch > 130 lần/phút).'
condition_logic:
  op: OR
  args:
  - type: symptom
    symptom_code: sym_shock_circulatory
    state: PRESENT
  - op: AND
    args:
    - type: age
      unit: years
      cmp: '>='
      value: 12
    - op: OR
      args:
      - type: vital
        vital: systolic_bp_mmhg
        cmp: <
        value: 90
      - type: vital
        vital: heart_rate_bpm
        cmp: '>'
        value: 130
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
    - op: OR
      args:
      - type: vital
        vital: systolic_bp_mmhg
        cmp: <
        value: 80
      - type: vital
        vital: heart_rate_bpm
        cmp: '>'
        value: 150
  - op: AND
    args:
    - type: age
      unit: years
      cmp: <
      value: 1
    - op: OR
      args:
      - type: vital
        vital: systolic_bp_mmhg
        cmp: <
        value: 70
      - type: vital
        vital: heart_rate_bpm
        cmp: '>'
        value: 170
---

# Cờ đỏ: Sốc hoặc suy tuần hoàn cấp (Tụt huyết áp hoặc mạch nhanh vượt ngưỡng theo tuổi)
CẤP CỨU: Dấu hiệu sốc/suy tuần hoàn (Ngưỡng trẻ em theo QĐ 292/QĐ-BYT mục II.6: nhũ nhi < 1 tuổi HATT < 70 mmHg hoặc mạch > 170, trẻ nhỏ 1-12 tuổi HATT < 80 hoặc mạch > 150; Ngưỡng người lớn theo QĐ 2699/QĐ-BYT: HATT < 90 hoặc mạch > 130 lần/phút).
