---
schema: okf_triage_rule_v1
rule_key: rf_septic_arthritis_suspected
rule_name: 'Cờ đỏ: Nghi ngờ viêm khớp nhiễm khuẩn sinh mủ cấp tính'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_qd_361_2014
source_edition: Quyết định số 361/QĐ-BYT
reason_text: 'CẤP CỨU: Nghi ngờ viêm khớp nhiễm khuẩn cấp (sưng nóng đỏ đau dữ dội
  một khớp kèm sốt cao rét run theo QĐ 361/QĐ-BYT bài Viêm khớp nhiễm khuẩn mục 3.1),
  nguy cơ hủy khớp nếu chậm xử trí.'
condition_logic:
  type: symptom
  symptom_code: sym_septic_arthritis_suspected
  state: PRESENT
---

# Cờ đỏ: Nghi ngờ viêm khớp nhiễm khuẩn sinh mủ cấp tính
CẤP CỨU: Nghi ngờ viêm khớp nhiễm khuẩn cấp (sưng nóng đỏ đau dữ dội một khớp kèm sốt cao rét run theo QĐ 361/QĐ-BYT bài Viêm khớp nhiễm khuẩn mục 3.1), nguy cơ hủy khớp nếu chậm xử trí.
