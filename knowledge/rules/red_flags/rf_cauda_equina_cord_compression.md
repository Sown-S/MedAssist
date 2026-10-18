---
schema: okf_triage_rule_v1
rule_key: rf_cauda_equina_cord_compression
rule_name: 'Cờ đỏ: Hội chứng đuôi ngựa hoặc chèn ép tủy cấp'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_co_xuong_khop_2014
source_edition: Quyết định số 361/QĐ-BYT
reason_text: 'CẤP CỨU: Bệnh nhân có dấu hiệu hội chứng đuôi ngựa (rối loạn cơ tròn,
  bí tiểu, tê vùng yên ngựa), cần hội chẩn ngoại thần kinh khẩn.'
condition_logic:
  type: symptom
  symptom_code: sym_cauda_equina
  state: PRESENT
---

# Cờ đỏ: Hội chứng đuôi ngựa hoặc chèn ép tủy cấp
CẤP CỨU: Bệnh nhân có dấu hiệu hội chứng đuôi ngựa (rối loạn cơ tròn, bí tiểu, tê vùng yên ngựa), cần hội chẩn ngoại thần kinh khẩn.
