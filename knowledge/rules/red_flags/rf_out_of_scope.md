---
schema: okf_triage_rule_v1
rule_key: rf_out_of_scope
rule_name: 'Cờ đỏ: Triệu chứng nguy hiểm nằm ngoài phạm vi danh mục chuẩn'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_qd_1840_2025
source_edition: Quyết định số 1840/QĐ-BYT
reason_text: 'CẤP CỨU: Bệnh nhân có triệu chứng nguy hiểm bất thường ngoài phạm vi
  danh mục chuẩn (QĐ 1840/QĐ-BYT mục III.1), dừng gợi ý AI để Bác sĩ khám trực tiếp
  ngay.'
condition_logic:
  type: symptom
  symptom_code: out_of_scope_symptom
  state: PRESENT
---

# Cờ đỏ: Triệu chứng nguy hiểm nằm ngoài phạm vi danh mục chuẩn
CẤP CỨU: Bệnh nhân có triệu chứng nguy hiểm bất thường ngoài phạm vi danh mục chuẩn (QĐ 1840/QĐ-BYT mục III.1), dừng gợi ý AI để Bác sĩ khám trực tiếp ngay.
