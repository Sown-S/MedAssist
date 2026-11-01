---
schema: okf_triage_rule_v1
rule_key: pf_gi_respiratory_bleeding
rule_name: 'Sàn ưu tiên cao: Dấu hiệu xuất huyết tiêu hóa hoặc ho ra máu'
rule_type: PRIORITY_FLOOR
resulting_priority: HighPriority
source_key: moh_qd_5642_2015
source_edition: Quyết định số 5642/QĐ-BYT
reason_text: 'ƯU TIÊN CAO: Bệnh nhân có dấu hiệu xuất huyết nội tạng (ho ra máu, nôn
  ra máu hoặc đại tiện phân đen theo QĐ 5642/QĐ-BYT bài Bệnh thương hàn & Dịch hạch),
  cần ưu tiên khám sớm.'
condition_logic:
  type: symptom
  symptom_code: sym_gi_respiratory_bleeding
  state: PRESENT
---

# Sàn ưu tiên cao: Dấu hiệu xuất huyết tiêu hóa hoặc ho ra máu
ƯU TIÊN CAO: Bệnh nhân có dấu hiệu xuất huyết nội tạng (ho ra máu, nôn ra máu hoặc đại tiện phân đen theo QĐ 5642/QĐ-BYT bài Bệnh thương hàn & Dịch hạch), cần ưu tiên khám sớm.
