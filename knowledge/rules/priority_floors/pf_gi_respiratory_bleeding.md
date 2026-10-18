---
schema: okf_triage_rule_v1
rule_key: pf_gi_respiratory_bleeding
rule_name: 'Sàn ưu tiên cao: Dấu hiệu xuất huyết tiêu hóa hoặc ho ra máu'
rule_type: PRIORITY_FLOOR
resulting_priority: HighPriority
source_key: moh_noi_khoa_2023
source_edition: Quyết định số 4817/QĐ-BYT
reason_text: 'ƯU TIÊN CAO: Bệnh nhân có dấu hiệu xuất huyết (ho ra máu, nôn ra máu
  hoặc phân đen), cần ưu tiên khám sớm để đánh giá mức độ mất máu.'
condition_logic:
  type: symptom
  symptom_code: sym_gi_respiratory_bleeding
  state: PRESENT
---

# Sàn ưu tiên cao: Dấu hiệu xuất huyết tiêu hóa hoặc ho ra máu
ƯU TIÊN CAO: Bệnh nhân có dấu hiệu xuất huyết (ho ra máu, nôn ra máu hoặc phân đen), cần ưu tiên khám sớm để đánh giá mức độ mất máu.
