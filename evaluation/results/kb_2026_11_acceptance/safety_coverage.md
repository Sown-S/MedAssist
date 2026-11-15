# Bao phủ an toàn 11 bệnh đã gỡ — nhận xét Huy và giới hạn

Nguồn: hai phản hồi Huy do người giao việc cung cấp trong hội thoại. Bảng này tổng hợp rà soát của Huy, không tự xác nhận của bác sĩ, không phải benchmark RuleOnly. `safety_coverage.csv` giữ phép kiểm mã đặc trưng đơn độc với sinh hiệu bình thường; không dùng phép kiểm đó để thay kết luận bệnh nhân điển hình.

| Bệnh đã gỡ | Mã/biểu hiện và cổng hiện tại | Khoảng trống theo nhận xét Huy |
|---|---|---|
| Viêm phù nề thanh thiệt cấp | `epiglottitis_drooling_muffled_voice`; `pf_sot_cao` khi sốt cao; `rf_respiratory_failure` khi đủ điều kiện suy hô hấp | Chỉ mã thanh thiệt/chảy dãi không tự kích Emergency. Không coi SpO2 bình thường là đủ an toàn; việc thêm cổng thuộc rà luật riêng. |
| Tắc ĐM trung tâm võng mạc | `central_retinal_artery_cherry_red_spot` hoặc `acute_visual_loss` → `rf_out_of_scope` Emergency | Ca mất thị lực đột ngột được bảo vệ nếu gán đúng mã cấp. Chỉ `visual_acuity_decreased_blur` không giữ thông tin khởi phát cấp, có thể Routine. Rà ánh xạ trích xuất ở việc riêng. |
| Viêm mủ nội nhãn ngoại sinh | `endophthalmitis_vitreous_pus_loss_reflex` → `rf_out_of_scope` Emergency | Đau/nhìn mờ/mủ tiền phòng chỉ gán mã nhãn khoa chung có thể không có cờ đỏ; không khẳng định được bảo vệ trước thăm khám chuyên sâu. |
| Viêm mủ nội nhãn nội sinh | Cùng mã nội nhãn → `rf_out_of_scope`; sốt cao có sàn ưu tiên | Đầu vào triệu chứng chung không tự được suy diễn thành mã nội nhãn. |
| Viêm tổ chức hốc mắt | `orbital_cellulitis_chemosis_proptosis` → `rf_out_of_scope` Emergency | Phù mi/lồi mắt/song thị bằng mã chung, không sốt cao, có thể không kích luật. |
| DRESS | `dress_syndrome_facial_edema_eosinophilia` chưa có cổng trực tiếp; sốt cao có sàn ưu tiên | Mã đặc trưng đơn độc chưa kích luật; triệu chứng và xét nghiệm trong mã gộp không được suy diễn từ bệnh danh. |
| SSSS | `staphylococcal_scalded_skin_exfoliation` chưa có cổng trực tiếp; sốt cao có sàn ưu tiên | Nhánh bong da rộng AND niêm mạc chảy máu không bao phủ đầu vào không có niêm mạc chảy máu. |
| Điếc đột ngột | `sudden_deafness_onset` không có cổng trực tiếp | Nghe kém đột ngột/ù tai ± chóng mặt không sốt có thể Routine. Người giao việc đã chấp nhận tiếp tục KB hiện tại; không coi đó là duyệt luật hay phê duyệt bác sĩ. |
| Viêm khớp nhiễm khuẩn | `sym_septic_arthritis_suspected` → `rf_septic_arthritis_suspected` Emergency | `septic_arthritis_purulent_synovial_fluid` hoặc tổ hợp sốt/sưng/giới hạn vận động chưa tương đương mã hội chứng trong logic luật hiện tại. |
| Viêm xương tủy nhiễm khuẩn | `osteomyelitis_bone_tenderness_fistula` chưa có cổng trực tiếp; sốt cao có sàn ưu tiên | Không sốt cao hoặc chỉ mã đặc trưng có thể Routine; cần rà mức ưu tiên theo tình huống, không mặc định mọi thể mạn là Emergency. |
| Áp xe cơ | `pyomyositis_psoas_muscle_abscess` chưa có cổng trực tiếp; sốt cao có sàn ưu tiên | Mã gộp nêu sốt không tự làm `fever_high` PRESENT; thiếu mã nguyên tử có thể không kích luật. |

Không có cờ đỏ không đồng nghĩa bệnh nhân chắc chắn được gợi đúng bệnh khác trong DDx. Chưa đánh giá đầy đủ DDx thay thế cho các đầu vào này; không sửa KB theo kết quả kiểm. Các đề xuất thêm luật phải được rà chuyên môn, xác định ngưỡng và nguy cơ báo nhầm trong công việc riêng.
