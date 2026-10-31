---
schema: okf_triage_rule_v1
rule_key: pf_sot_cao
rule_name: 'Sàn ưu tiên cao: Sốt cao >= 38,5°C (Theo ngưỡng Bộ Y tế QĐ 2699/QĐ-BYT
  & QĐ 5642/QĐ-BYT)'
rule_type: PRIORITY_FLOOR
resulting_priority: HighPriority
source_key: moh_qd_1327_2014
source_edition: Quyết định số 1327/QĐ-BYT
reason_text: 'ƯU TIÊN CAO: Bệnh nhân sốt cao >= 38,5°C (ngưỡng chỉ định dùng thuốc
  hạ sốt và theo dõi biến chứng theo hướng dẫn Bộ Y tế QĐ 2699/QĐ-BYT mục III.2.4.a
  và QĐ 5642/QĐ-BYT mục 4.5), cần ưu tiên khám sớm.'
condition_logic:
  op: OR
  args:
  - type: vital
    vital: temperature_c
    cmp: '>='
    value: 38.5
  - type: symptom
    symptom_code: fever_high
    state: PRESENT
---

# Sàn ưu tiên cao: Sốt cao >= 38,5°C (Theo ngưỡng Bộ Y tế QĐ 2699/QĐ-BYT & QĐ 5642/QĐ-BYT)
ƯU TIÊN CAO: Bệnh nhân sốt cao >= 38,5°C (ngưỡng chỉ định dùng thuốc hạ sốt và theo dõi biến chứng theo hướng dẫn Bộ Y tế QĐ 2699/QĐ-BYT mục III.2.4.a và QĐ 5642/QĐ-BYT mục 4.5), cần ưu tiên khám sớm.
