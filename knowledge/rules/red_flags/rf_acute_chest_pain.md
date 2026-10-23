---
schema: okf_triage_rule_v1
rule_key: rf_acute_chest_pain
rule_name: 'Cờ đỏ: Đau thắt ngực dữ dội cấp tính'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_qd_1327_2014
source_edition: Quyết định số 1327/QĐ-BYT
reason_text: 'CẤP CỨU: Bệnh nhân đau tức ngực dữ dội cấp tính, cần loại trừ hội chứng
  vành cấp, viêm cơ tim hoặc chèn ép tim ngay.'
condition_logic:
  type: symptom
  symptom_code: sym_acute_chest_pain
  state: PRESENT
---

# Cờ đỏ: Đau thắt ngực dữ dội cấp tính
CẤP CỨU: Bệnh nhân đau tức ngực dữ dội cấp tính, cần loại trừ hội chứng vành cấp, viêm cơ tim hoặc chèn ép tim ngay.
