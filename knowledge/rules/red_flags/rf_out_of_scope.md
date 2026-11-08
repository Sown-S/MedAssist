---
schema: okf_triage_rule_v1
rule_key: rf_out_of_scope
rule_name: 'Cờ đỏ: Triệu chứng nguy hiểm nằm ngoài phạm vi danh mục chuẩn'
rule_type: RED_FLAG
resulting_priority: Emergency
source_key: moh_qd_1840_2025
source_edition: Quyết định số 1840/QĐ-BYT
reason_text: 'CẤP CỨU: Dấu hiệu nguy hiểm đã xác nhận ngoài phạm vi ngoại trú (xâm nhập đường thở, chấn
  thương nặng hoặc tổn thương mắt cấp, dấu thần kinh hay suy tưới máu). Dừng gợi ý bệnh, yêu cầu bác sĩ
  đánh giá khẩn. Không áp dụng chỉ vì có mã nghi u hoặc dấu hiệu mạn tính ổn định.'
condition_logic:
  op: OR
  args:
  - type: symptom
    symptom_code: out_of_scope_symptom
    state: PRESENT
  - type: symptom
    symptom_code: chemical_eye_exposure
    state: PRESENT
  - type: symptom
    symptom_code: acute_visual_loss
    state: PRESENT
  - type: symptom
    symptom_code: major_head_face_trauma
    state: PRESENT
  - type: symptom
    symptom_code: penetrating_neck_wound
    state: PRESENT
  - type: symptom
    symptom_code: sudden_choking
    state: PRESENT
  - type: symptom
    symptom_code: trismus_tetanic_spasm
    state: PRESENT
  - op: AND
    args:
    - type: symptom
      symptom_code: meningeal_neck_stiffness_kernig
      state: PRESENT
    - type: symptom
      symptom_code: fever_high
      state: PRESENT
  - op: AND
    args:
    - type: symptom
      symptom_code: widespread_skin_peeling
      state: PRESENT
    - type: symptom
      symptom_code: bleeding_mucosal_erosions
      state: PRESENT
  - op: AND
    args:
    - type: symptom
      symptom_code: cold_extremities
      state: PRESENT
    - type: symptom
      symptom_code: reduced_urine_output
      state: PRESENT
  - type: symptom
    symptom_code: airway_penetration_syndrome
    state: PRESENT
  - type: symptom
    symptom_code: ocular_chemical_burn_limbal_ischemia
    state: PRESENT
  - type: symptom
    symptom_code: traumatic_hyphema_angle_recession
    state: PRESENT
  - type: symptom
    symptom_code: traumatic_optic_neuropathy_defect
    state: PRESENT
  - type: symptom
    symptom_code: temporal_bone_fracture_hemotympanum
    state: PRESENT
  - type: symptom
    symptom_code: acute_angle_closure_mid_dilated_pupil
    state: PRESENT
  - type: symptom
    symptom_code: central_retinal_artery_cherry_red_spot
    state: PRESENT
  - type: symptom
    symptom_code: endophthalmitis_vitreous_pus_loss_reflex
    state: PRESENT
  - type: symptom
    symptom_code: corneal_perforation_iris_prolapse
    state: PRESENT
  - type: symptom
    symptom_code: orbital_cellulitis_chemosis_proptosis
    state: PRESENT
---

# Cờ đỏ: Triệu chứng nguy hiểm nằm ngoài phạm vi danh mục chuẩn
CẤP CỨU: Bệnh nhân có triệu chứng nguy hiểm bất thường ngoài phạm vi danh mục chuẩn (QĐ 1840/QĐ-BYT mục III.1), dừng gợi ý AI để Bác sĩ khám trực tiếp ngay.

## Bao phủ khi thu hẹp phạm vi KB-2026.09

Các dấu hiệu cấp được xác nhận tại tiếp đón sẽ dừng DDx: hóa chất vào mắt, giảm thị lực đột ngột, chấn thương đầu mặt nặng, vết thương xuyên cổ, sặc đột ngột, co cứng hàm/toàn thân; sốt kèm dấu màng não; bong da rộng kèm tổn thương niêm mạc; chi lạnh ẩm kèm tiểu ít mới xuất hiện. Giữ nguyên các cổng suy hô hấp, sốc, ý thức, co giật và thần kinh.

Nguồn đối chiếu: QĐ 40/QĐ-BYT, QĐ 75/QĐ-BYT, QĐ 5642/QĐ-BYT và QĐ 5643/QĐ-BYT trong sources/. Nhánh ngoài phạm vi không đồng nghĩa mọi nghi ngờ ung thư ổn định đều là cấp cứu.

## Hồi quy đầu vào cũ

Các mã airway_penetration_syndrome, ocular_chemical_burn_limbal_ischemia, traumatic_hyphema_angle_recession và traumatic_optic_neuropathy_defect tự kích hoạt cổng ngoài phạm vi khi PRESENT, kể cả sinh hiệu bình thường và những cờ đỏ khác ABSENT. Các nhánh tổn thương mắt cấp và dấu vỡ xương đá được xác nhận cũng được bảo vệ; không dùng các mã nhìn mờ chung, khối vùng cổ hoặc sẹo hẹp mạn để suy diễn cấp cứu.
