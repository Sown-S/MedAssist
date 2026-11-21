---
schema: okf_review_log_v1
author: Tuan
cross_reviewer: Huy
review_status: APPROVED
---

# Biên bản rà chéo danh mục triệu chứng nhóm trọng tâm — KB-2026.12.1

CSV v2 gồm 135 mã hiện có trong `relations` của 28 hồ sơ cơ xương khớp, 10 hồ sơ bệnh phổ biến và hồ sơ `cam_lanh_thong_thuong`. Huy xác nhận đồng ý tích hợp nguyên bản v2 trong phản hồi do Tuấn chuyển lại ngày 20/11/2026. Trạng thái rà chéo áp dụng cho ba trường của CSV v2. Ba trường đã được chép vào [catalog](../../knowledge/symptoms/symptom_catalog.md) theo schema hiện có.

Huy đối chiếu lại và xác nhận tệp đã rà giống từng byte với tệp Tuấn gửi lại. Tệp có 24.194 byte và SHA-256 `4c04dc7b47e954dc08a7dd607f93c58a616ac302c611816dbf6b8dedf31b7619`. Bản v2 có 135 mã, 359 alias và 103 `both`, 19 `reported`, 13 `exam`. Số 355 trong phản hồi trước được ghi nhầm từ v1.

Trước khi dọn staging, đã xác minh có thể tái tạo đúng từng byte từ catalog. Lấy 135 mục đã bổ sung trường, sắp xếp theo `symptom_code`, rồi xuất CSV chuẩn với bốn cột `symptom_code,short_name,aliases,detection`, BOM UTF-8 và LF. Trong mỗi ô alias, nối các phần tử theo thứ tự trong catalog bằng dấu chấm phẩy.

## Mã amidan Sơn đã xác nhận

Sơn xác nhận tên mã đầy đủ là `tonsillar_cryptic_exudate_hypertrophy` và đồng ý giữ `both`. Mã này vắng trong tập nhãn 29 ca. Alias của mã này đều nêu bã trắng hoặc bã đậu ở amidan. Alias của `tonsillitis_adenoid_pharyngitis` mô tả họng đỏ hoặc amidan sưng kèm nuốt đau/vướng. Huy đồng ý với cách phân biệt hai mã trong v2.

## Điều chỉnh câu chữ sau rà chéo

- `fever_high` bỏ “sốt cao liên tục” vì giao nghĩa với tên mã thương hàn. Dùng “sốt cao”, “sốt cao đột ngột” và “sốt từ 38,5 độ”. Từ “từ” giữ đúng ngưỡng bao gồm 38,5°C trong catalog.
- `headache_dull` bỏ alias “đầu đau nhức dữ dội” theo góp ý của Sơn và giữ các cụm về đau âm ỉ. Tên catalog hiện ghi cả âm ỉ và dữ dội. Nếu cần giới hạn nghĩa của mã về đau âm ỉ, bác sĩ và Tuấn cần xác nhận riêng.
- `cough_dry` dùng “ho khan” và biến thể trực tiếp, `cough_productive_sputum` thêm “ho có đờm”. `hearing_loss_deafness` dùng “nghe kém”, “giảm thính lực” hoặc “bị điếc”. Các cụm này diễn đạt trực tiếp biểu hiện thay cho cách nói phủ định dễ lẫn nghĩa.
- Thêm cụm nói ngắn khớp tên catalog cho chóng mặt, nghẹt mũi, ù tai, đau tai, đau họng, khó thở khi gắng sức, nổi hạch cổ, sổ mũi và đau mặt ngoài khuỷu tay. Rút gọn một số cụm dài về sốt ho khó thở sau khi gặp gia cầm, dấu hiệu vùng vòm họng và da cứng kèm đổi màu đầu ngón.

## Mã gộp

Các dấu hiệu người bệnh hoặc người chăm sóc có thể kể đứng trước phần cần khám hoặc xác nhận. Các mã dưới đây đều đặt `both`.

| Mã | Phần có thể kể và phần cần xác nhận |
| --- | --- |
| `acute_podagra_tophi` | Khớp ngón chân cái đột ngột sưng nóng đỏ đau, kèm khả năng có hạt Tôphi. |
| `adenoid_facies_mouth_breathing` | Thường há miệng để thở, kèm đặc điểm hình thể của bộ mặt V.A và vòm khẩu cái. |
| `allergic_sneezing_nasal_itch` | Ngứa mũi, hắt hơi từng tràng, kèm niêm mạc mũi nhợt và phù nề. |
| `anemia_pallor_jaundice` | Da xanh hoặc vàng da mắt có thể được nhận thấy, khám đánh giá niêm mạc nhợt. |
| `ankylosing_spondylitis_schober_chest` | Khó cử động lưng dưới có thể được kể, mức hạn chế được đo bằng Schober và độ giãn lồng ngực. |
| `avascular_femoral_head_necrosis_groin_pain` | Đau sâu vùng bẹn lan đùi, kèm hạn chế xoay trong và dạng háng khi đánh giá vận động. |
| `avian_influenza_rapid_ards_pneumonia` | Sốt, ho, khó thở tăng nhanh sau tiếp xúc gia cầm, kèm chẩn đoán viêm phổi nặng và ARDS. |
| `bone_pain_fracture_lesion` | Đau sâu trong xương hoặc nhận thấy biến dạng, kèm lún đốt sống hay gãy xương bệnh lý. |
| `cervical_radiculopathy_spurling` | Đau từ gáy lan xuống vai tay, tê bì, kèm Spurling dương tính. |
| `chronic_cor_pulmonale_edema_jugular_vein` | Thấy hai chân phù, kèm các dấu tĩnh mạch cổ, gan to và phản hồi gan–tĩnh mạch cổ. |
| `conductive_hearing_loss` | Người bệnh kể nghe kém, khám phân biệt thể dẫn truyền bằng Rinne và Weber. |
| `conjunctivitis_uveitis_red_eye` | Mắt đỏ, chảy nước mắt hoặc sợ ánh sáng, khám phân biệt viêm kết mạc và viêm màng bồ đào. |
| `copd_barrel_chest_pursed_lip_breathing` | Nhận thấy chúm môi, thở ra kéo dài, kèm lồng ngực hình thùng và gõ vang. |
| `cyanosis_hypoxemia_central_peripheral` | Có thể nhận thấy môi hoặc đầu chi tím, nguyên nhân giảm oxy máu động mạch cần xác nhận. |
| `de_quervain_radial_styloid_tenosynovitis` | Cổ tay phía ngón cái sưng đau khi cử động ngón cái, kèm Finkelstein. |
| `dermatomyositis_shawls_mechanic_hands` | Ban vùng cổ ngực và yếu vùng gốc chi, kèm dấu khăn quàng và bàn tay thợ cơ khí. |
| `discoid_lupus_follicular_plugging_scarring` | Mảng đỏ có vảy dính rồi để lại sẹo, khám nhận diện dấu đinh thảm và teo da. |
| `dizziness_vertigo` | Kể chóng mặt, hoa mắt hoặc mất thăng bằng, khám xác nhận động mắt. |
| `duchene_becker_gowers_calf_hypertrophy` | Người chăm sóc kể dáng đi lạch bạch, khám đánh giá Gowers và giả phì đại bắp chân. |
| `enthesitis_achilles_heel` | Kể đau chỗ gân bám ở gót, khám xác nhận viêm điểm bám gân hoặc cân gan chân. |
| `epiglottitis_drooling_muffled_voice` | Nuốt đau, chảy dãi, đổi giọng, kèm sưng đỏ thanh thiệt khi khám. |
| `fibrous_dysplasia_bone_deformity_fracture` | Kể đau xương hoặc thấy xương cong, khám xác nhận dạng biến dạng và gãy xương bệnh lý. |
| `giant_cell_bone_tumor_epiphyseal_swelling` | Đau và sưng ở đầu xương, kèm hình ảnh tiêu xương vỏ mỏng. |
| `gout_hyperuricemia_colchicine_response` | Kể cơn đau khớp lên đỉnh trong ngày đầu, kèm đáp ứng thuốc và tăng acid uric máu. |
| `heliotrope_gottron_sign` | Có thể kể đổi màu da quanh mí hoặc sẩn trên khớp ngón, khám định danh Heliotrope hoặc Gottron. |
| `hip_groin_pain_limping` | Đau háng/bẹn và đi khập khiễng, khám đánh giá dạng và xoay trong khớp háng. |
| `joint_range_of_motion_limitation` | Có thể kể khớp hay cột sống cử động khó, khám đánh giá biên độ chủ động và thụ động. |
| `joint_swelling_warmth_redness_effusion` | Sưng, nóng đỏ thấy được, khám xác nhận tràn dịch hay dày màng hoạt dịch. |
| `knee_effusion_crepitus_locking` | Gối sưng, kêu lục cục hoặc kẹt, khám xác nhận tràn dịch. |
| `knee_osteoarthritis_wood_planing_osteophyte` | Đau gối khi vận động hoặc thấy chân vòng kiềng, kèm dấu bào gỗ. |
| `laryngeal_tuberculosis_monochorditis` | Đau lan lên tai, kèm tổn thương dây thanh hoặc bờ sụn phễu. |
| `lateral_epicondylitis_tennis_elbow` | Đau mặt ngoài khuỷu lan xuống cẳng tay, khám đánh giá đau tăng khi duỗi cổ tay có đối kháng. |
| `limb_numbness_paresthesia_tingling` | Tê bì, kiến bò hoặc châm chích, khám đánh giá giảm cảm giác nông. |
| `lumbar_spondylosis_paraspinal_spasm` | Đau thắt lưng lâu ngày và có thể nhận thấy căng cứng, khám đánh giá co cơ và lệch vẹo chống đau. |
| `lymphadenopathy_splenomegaly` | Người bệnh có thể sờ thấy hạch ngoại vi, khám đánh giá gan hoặc lách to. |
| `middle_meatus_mucopurulent_discharge` | Có thể kể dịch nhầy mủ xuống họng, khám thấy mủ ở khe mũi giữa hoặc thành sau họng. |
| `muscle_tenderness_cramps_myotonia` | Có thể kể đau khi bóp bắp cơ hoặc co cứng, khám đánh giá co cứng hay teo cơ. |
| `osteomyelitis_bone_tenderness_fistula` | Đau xương khu trú, sưng hoặc rò mủ, khám xác nhận lỗ rò và mảnh xương chết. |
| `osteoporosis_vertebral_collapse_kyphosis` | Đau lưng, thấp đi hoặc gù, kèm lún xẹp đốt sống cần xác nhận. |
| `otomycosis_fungal_debris` | Ngứa ống tai, khám xác nhận các mảng trong tai là nấm. |
| `proximal_muscle_weakness_wasting` | Kể yếu vùng cơ gần vai, háng, khám đánh giá teo cơ hay giả phì đại bắp chân. |
| `psoriasis_auspitz_brocq_koebner` | Thấy mảng đỏ, vảy trắng dày, kèm nghiệm pháp cạo Brocq và hiện tượng Koebner. |
| `psoriatic_dactylitis_distal_interphalangeal` | Thấy ngón sưng như khúc dồi hoặc thay đổi da/móng, khám xác nhận vị trí khớp và tổn thương vảy nến. |
| `pyomyositis_psoas_muscle_abscess` | Sưng đau bắp cơ khu trú và sốt cao, kèm dấu cơ thắt lưng chậu. |
| `radicular_sensory_motor_reflex_deficit` | Tê theo dải hoặc cảm thấy yếu ở phần xa của chi, khám kiểm tra phân bố rễ và phản xạ gân xương. |
| `reactive_arthritis_urethritis_conjunctivitis` | Có thể kể diễn tiến sau nhiễm khuẩn và các vấn đề ở khớp, tiểu tiện, mắt. Cần xác nhận tam chứng cụ thể và phân bố khớp. |
| `rheumatoid_nodules_ulnar_deviation` | Có thể sờ thấy cục dưới da hoặc thấy khớp tay lệch, khám định danh hạt thấp và kiểu biến dạng. |
| `sciatica_lasegue_positive` | Đau lan dọc xuống chân, kèm Lasègue và Valleix. |
| `sclerodactyly_digital_ulcers_telangiectasia` | Kể da ngón dày cứng, loét hoặc khó há miệng, khám đánh giá giãn mao mạch và sẹo rỗ. |
| `septic_arthritis_purulent_synovial_fluid` | Một khớp lớn sưng nóng đỏ đau dữ dội, khó cử động, kèm dịch khớp đục mủ cần xác nhận. |
| `skin_sclerosis_raynaud` | Người bệnh có thể nhận thấy da dày cứng hoặc từng đợt đổi màu đầu ngón, khám xác nhận hội chứng Raynaud. |
| `sle_alopecia_nephritis_cytopenia` | Kể rụng tóc, đánh giá sẹo da đầu và xác nhận thành phần tổn thương thận hoặc giảm dòng tế bào máu. |
| `snoring_sleep_apnea` | Người bệnh hoặc người chăm sóc kể ngáy, ngừng thở lúc ngủ hoặc buồn ngủ ban ngày, kèm chỉ số AHI. |
| `tendinitis_finkelstein_trigger_elbow` | Kể đau cổ tay phía ngón cái, ngón bị kẹt/bật khi duỗi hoặc đau ngoài khuỷu, có thành phần Finkelstein. |
| `tonsillar_cryptic_exudate_hypertrophy` | Có thể kể đã thấy bã trắng ở amidan, khám xác nhận quá phát và chất trong hốc amidan. Sơn đã xác nhận `both`. |
| `tonsillitis_adenoid_pharyngitis` | Nuốt đau/vướng có thể được kể, khám đánh giá họng đỏ, amidan hoặc VA sưng, mủ/giả mạc. |
| `trigger_finger_flexor_tendon_nodule` | Ngón bị kẹt hoặc bật khi duỗi, khám sờ hạt xơ gân gấp. |
| `wheezing_bronchospasm` | Kể thở khò khè hoặc cò cử, nghe phổi xác nhận ran rít/ran ngáy. |

## Mã mơ hồ về detection

Giữ `both` cho các mã sau trong v2. Bác sĩ có thể rà thêm ranh giới giữa điều người bệnh mô tả và dấu hiệu chuyên biệt cần xác nhận.

- Có thể kể biểu hiện sưng, đau, lệch hoặc cứng, nhưng kiểu phân bố hay tổn thương cụ thể cần xác nhận: `asymmetric_oligoarthritis_lower`, `jia_systemic_polyarticular_enthesitis`, `joint_deformity_ankylosis_subluxation`, `periarticular_tendon_bursa_tenderness`, `shoulder_periarthritis_restricted`, `symmetric_polyarthritis_hands`.
- Người bệnh hoặc người chăm sóc có thể nhìn thấy một phần biểu hiện, việc nhận dạng dấu chuyên biệt còn cần rà: `erythema_nodosum_shins`, `external_ear_swelling_fistula`, `fetid_cholesteatoma_otorrhea`, `intoxication_coated_tongue_dry_lips`, `malar_butterfly_photosensitivity`, `mastoid_retroauricular_swelling`, `petechiae_mucosal_bleeding`, `psoriatic_plaque_nail_pitting`, `skin_cellulitis_pus_abscess`, `spinal_deformity_scoliosis_loss_lordosis`, `tachypnea_accessory_muscle_retractions`.
- `tympanic_membrane_lesion` mô tả tổn thương khi soi tai. Đối chiếu JSONL v1.4 xác nhận mã có nhãn ở `EXT-021`. Giữ `both` theo quy tắc bảo toàn nhãn. Để trống alias vì lời kể đau tai hoặc nghe kém không xác định được tổn thương màng nhĩ.
- Huy đề nghị bác sĩ rà kỹ `periarticular_tendon_bursa_tenderness` và `fetid_cholesteatoma_otorrhea`. Cả hai vẫn để `both` trong bản nháp.

## Mã gộp khó đặt alias

- `conductive_hearing_loss` và `reactive_arthritis_urethritis_conjunctivitis` để trống alias. “Nghe kém” dùng cho mã nghe kém chung. Cách nói đủ đặc hiệu cho thể dẫn truyền hoặc tam chứng viêm khớp, niệu đạo và kết mạc sau nhiễm khuẩn vẫn cần bác sĩ rà.
- `laryngeal_tuberculosis_monochorditis` bỏ “đau lan lên tai” vì triệu chứng đứng riêng dễ nhầm với mã khác. Tên ngắn mới “Viêm dây thanh, loét sụn phễu” chỉ rõ tổn thương trong catalog. `symptom_name` vẫn chứa “đau lan lên tai”. Huy đồng ý tích hợp v2 và đề nghị bác sĩ rà riêng việc chuyển sang `exam`.
- Bỏ alias ở `ankylosing_spondylitis_schober_chest`, `chronic_cor_pulmonale_edema_jugular_vein` và `sle_alopecia_nephritis_cytopenia`. Tên ngắn bổ sung ngữ cảnh khám. Các cụm trước đây chỉ mô tả cứng lưng dưới, phù chân hoặc rụng tóc.
- Hai mã `de_quervain_radial_styloid_tenosynovitis` và `tendinitis_finkelstein_trigger_elbow` cùng bao hàm đau cổ tay phía ngón cái. Alias của mã thứ nhất nêu thêm đau khi cử động ngón cái. Mã gộp rộng còn có đau ngoài khuỷu và ngón bị kẹt/bật, là phần giao nghĩa với `lateral_epicondylitis_tennis_elbow` và `trigger_finger_flexor_tendon_nodule`. Đã thêm “đau mặt ngoài khuỷu tay” cho mã đặc hiệu tương ứng.
- `septic_arthritis_purulent_synovial_fluid` bỏ cả ba alias về khớp sưng nóng đỏ đau vì giao nghĩa với mã cờ đỏ `sym_septic_arthritis_suspected`. Tên ngắn mới nêu dịch khớp đục mủ để phân biệt. Bác sĩ cần rà nguy cơ giao nghĩa còn lại trong `symptom_name`. `cyanosis_hypoxemia_central_peripheral` vẫn chỉ dùng alias về biểu hiện tím nhìn thấy được.
- Cả sáu mã Huy nêu để cân nhắc `exam` đều vắng trong luật `rf_*`, luật `pf_*` và nhãn 29 ca. Giữ `both` cho `laryngeal_tuberculosis_monochorditis`, `conductive_hearing_loss`, `septic_arthritis_purulent_synovial_fluid`, `ankylosing_spondylitis_schober_chest`, `chronic_cor_pulmonale_edema_jugular_vein` và `sle_alopecia_nephritis_cytopenia` theo quy tắc mã gộp hiện tại. Tuấn và bác sĩ cần quyết định về phạm vi của từng mã trước khi thay đổi `detection`.
- Huy đề xuất thứ tự gửi bác sĩ rà `detection` sau tích hợp: (1) `septic_arthritis_purulent_synovial_fluid`, (2) `laryngeal_tuberculosis_monochorditis`, (3) `conductive_hearing_loss`. Ba mã gộp còn lại tiếp tục theo dõi với `both` và danh sách alias rỗng.
- Alias trong 13 dòng `exam` được để trống vì tên catalog chỉ mô tả dấu hiệu hoặc kết quả khám/đo.

## Luật sàn ưu tiên

- `sym_gi_respiratory_bleeding` và `sym_severe_dehydration` chỉ xuất hiện trong `condition_logic` của `pf_*` khi đối chiếu với toàn bộ `relations` và luật `rf_*`. Cả hai ở ngoài phạm vi CSV.
- `petechiae_mucosal_bleeding` có trong hồ sơ trọng tâm và luật `pf_*`, vắng trong luật `rf_*`. Giữ `both` do còn mơ hồ giữa mô tả và xác nhận dấu hiệu. Importer hiện kiểm điều kiện cấm `exam` cho mọi mã được luật dùng, gồm cả `pf_*`.

## Mã nhãn của 29 ca nằm ngoài phạm vi CSV

- `conjunctival_ciliary_injection_discharge`
- `corneal_ulcer_hypopyon_keratitis`
- `eschar_ulcer_bite_lesion`
- `genital_ulcer_chancre_discharge`
- `gonorrhea_purulent_urethritis_dysuria`
- `herpetic_dermatomal_pain_blister`
- `hfmd_palmoplantar_vesicles_herpangina`
- `intraocular_pressure_glaucoma_cupping`
- `koplik_spots`
- `meningeal_neck_stiffness_kernig`
- `ocular_pain_photophobia_tearing`
- `otorrhea_ear_discharge`
- `pruritus_intense_skin_itch`
- `scabies_interdigital_burrows_nocturnal`
- `sym_acute_chest_pain`
- `sym_altered_consciousness`
- `sym_cauda_equina`
- `sym_progressive_paralysis`
- `sym_respiratory_failure`
- `sym_septic_arthritis_suspected`
- `visual_acuity_decreased_blur`

## Cảnh báo giao nghĩa và snapshot

- Bộ kiểm staging dùng `alias_key` của importer để kiểm tra trùng. Khi so với tên mã ngoài phạm vi, bộ kiểm cũng chuẩn hóa dấu câu và một số biến thể từ thông dụng. Huy rà thêm nghĩa của các cụm được cảnh báo.
- Hai alias từng bị cảnh báo đã được bỏ. Lần kiểm cuối trên staging ghi nhận 11 trường hợp cụm ngắn khớp một phần tên mã ngoài phạm vi, gồm “chóng mặt”, “sốt cao”, “giảm thính lực”, “nghe kém”, “đau họng” và “ù tai”. Huy đã rà và đồng ý giữ cả sáu cụm trong v2, kể cả “sốt cao” có trong tên mã cờ đỏ `sym_septic_arthritis_suspected`.
- `verify_v1_4.py` chỉ đối chiếu snapshot của toàn bộ `knowledge/` khi nhãn release khớp `knowledge_snapshot.kb_release`. Catalog tích hợp dùng KB-2026.12.1. Snapshot đóng băng dùng KB-2026.11.
