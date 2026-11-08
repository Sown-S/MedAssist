---
schema: okf_condition_v1
condition_code: benh_may_day
name_vi: Bệnh mày đay
name_en: Urticaria
icd10_code: L50.9
disease_group: dermatology
description: Mày đay là phản ứng của mao mạch trên da với các yếu tố khác nhau gây nên phù cấp hoặc mạn
  tính ở trung bì. Cơ chế phức tạp, đa số là thông qua kháng thể IgE; trong đó có vai trò quan trọng của
  các chất trung gian hóa học, nhất là histamin. Là bệnh da phổ biến, do nhiều nguyên nhân khác nhau gây
  ra, dễ nhận biết nhưng rất khó tìm được nguyên nhân chính xác.
relations:
- symptom_code: urticarial_wheal_angioedema
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: allergic_contact_dermatitis_patch_pos
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: pigmentary_macule_patch
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: vulvovaginal_oral_candidiasis_curd
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: pruritus_intense_skin_itch
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
excerpts:
- excerpt_key: benh_may_day_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh mày đay
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 75/QĐ-BYT)
---

## excerpt: benh_may_day_chan_doan
- Chẩn đoán xác định
- Thương tổn cơ bản: là các sẩn phù kích thước to nhỏ khác nhau xuất hiện ở
- ất kì vùng da nào trên cơ thể. Sẩn phù hơi nổi cao trên mặt da, màu sắc hơi đỏ
- hoặc nhợt nhạt hơn vùng da xung quanh. Kích thước và hình dáng của các mảng sẩn
- Phân bố: có thể khu trú hoặc lan rộng toàn thân.
- Ở vùng tổ chức lỏng lẻo như mi mắt, môi, sinh dục ngoài... các ban đỏ, sẩn
- phù xuất hiện đột ngột làm sưng to cả một vùng, còn gọi là phù mạch hay phù
- như khó thở nặng, đi ngoài phân lỏng, đau bụng quặn, tụt huyết áp, rối loạn tim
- thêm nhiều sẩn khác. Tuy nhiên, có trường hợp chỉ là cảm giác châm chích hoặc rát
- Tiến triển: sau vài phút hoặc vài giờ thì các sẩn phù lặn mất, không để lại
- Mày đay cấp: là phản ứng tức thì xảy ra trong vòng 24 giờ, có thể kéo dài
- Mày đay mạn: là mày đay tồn tại trên 6 tuần, có thể kéo dài hàng tháng,
- Cận lâm sàng
- Mày đay được chẩn đoán chủ yếu dựa vào lâm sàng. Có một số xét nghiệm
- Công thức máu: xác định số lượng bạch cầu đa nhân ái toan, nếu có tăng
- an đỏ hệ thống.
- Thử nghiệm lẩy da (prick test) với dị nguyên nghi ngờ (mạt bụi nhà, phấn
- Thử nghiệm áp da (patch test) với dị nguyên nghi ngờ.
- Sinh thiết da nếu mày đay kéo dài và giúp xác định viêm mao mạch.
- Định lượng kháng nguyên đặc hiệu loại IgE theo công nghệ MAST CLA 1
