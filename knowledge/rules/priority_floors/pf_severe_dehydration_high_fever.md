---
schema: okf_triage_rule_v1
rule_key: pf_severe_dehydration_high_fever
rule_name: 'Sàn ưu tiên cao: Sốt cao >= 39°C kèm dấu hiệu mất nước hoặc xuất huyết
  niêm mạc'
rule_type: PRIORITY_FLOOR
resulting_priority: HighPriority
source_key: moh_cum_mua_2025
source_edition: Quyết định số 1840/QĐ-BYT
reason_text: 'ƯU TIÊN CAO: Bệnh nhân sốt cao >= 39°C hoặc có dấu hiệu mất nước, nôn
  nhiều, chấm xuất huyết, cần ưu tiên khám sớm.'
condition_logic:
  op: OR
  args:
  - type: symptom
    symptom_code: sym_severe_dehydration
    state: PRESENT
  - type: vital
    vital: temperature_c
    cmp: '>='
    value: 39.0
  - op: AND
    args:
    - type: symptom
      symptom_code: fever_high
      state: PRESENT
    - type: symptom
      symptom_code: petechiae_mucosal_bleeding
      state: PRESENT
---

# Sàn ưu tiên cao: Sốt cao >= 39°C kèm dấu hiệu mất nước hoặc xuất huyết niêm mạc
ƯU TIÊN CAO: Bệnh nhân sốt cao >= 39°C hoặc có dấu hiệu mất nước, nôn nhiều, chấm xuất huyết, cần ưu tiên khám sớm.
