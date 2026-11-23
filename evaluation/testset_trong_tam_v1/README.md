# Bộ ca trọng tâm v1 · KB-2026.12.1

Pha B đã hoàn tất ngày 23/11/2026. Trong 50 ca của `clinical_cases_labeled.jsonl`, 40 ca có nhãn đồng thuận (`CROSS_REVIEW_AGREED`). Mười ca còn lại mang trạng thái `PENDING_CROSS_REVIEW` và giữ cả ba nhãn cuối trống để bác sĩ quyết. Bộ ca chưa đóng băng.

## Hướng dẫn điền phiếu mù

Tuấn chuyển riêng `phieu_gan_nhan_huy.csv` cùng hướng dẫn này. Huy lưu bản điền đủ 50 dòng với tên `huy_labels.csv` trong cùng thư mục. Giữ nguyên năm cột đầu và ID để ghép kể cả khi đổi thứ tự dòng. Đọc tuổi theo năm (0.75 là 9 tháng), sinh hiệu theo đơn vị ghi trong khóa và triệu chứng theo trạng thái. Khóa bỏ trống trong đối tượng JSON có nghĩa UNKNOWN. ABSENT là dữ kiện phủ định rõ của ca. Nhóm bệnh là trường đầu vào theo schema v1.4.

| Cột cần điền | Giá trị hợp lệ |
| --- | --- |
| expected_priority | Một trong `Emergency`, `HighPriority`, `Routine` |
| expected_triggered_rules | Mảng JSON các mã luật khác nhau đã đủ điều kiện. Ghi `[]` khi không có luật nào |
| expected_top_conditions | Mảng JSON các mã bệnh khác nhau theo thứ tự ưu tiên chẩn đoán, mã đứng đầu là đề xuất chính |
| ghi_chu | Tùy chọn. Ghi dữ kiện thiếu hoặc lý do cần bác sĩ quyết khi bệnh cảnh chồng lấp |

Dùng dấu ngoặc kép cho từng mã trong mảng JSON. CSV dùng dấu phẩy, UTF-8 và LF. Danh sách dưới đây áp dụng chung cho mọi dòng. Có thể tra điều kiện từng luật trong `knowledge/rules/`, hồ sơ bệnh trong `knowledge/conditions/` và tên triệu chứng trong `knowledge/symptoms/symptom_catalog.md`.

### Mã luật

- `pf_gi_respiratory_bleeding`
- `pf_severe_dehydration_high_fever`
- `pf_sot_cao`
- `rf_acute_chest_pain`
- `rf_altered_consciousness`
- `rf_cauda_equina_cord_compression`
- `rf_out_of_scope`
- `rf_progressive_paralysis`
- `rf_respiratory_failure`
- `rf_seizures`
- `rf_septic_arthritis_suspected`
- `rf_shock_circulatory_failure`

### Mã bệnh trong KB

- `a_vay_nen_va_vay_phan_dang_lichen`
- `benh_apthose`
- `benh_bach_bien`
- `benh_choc`
- `benh_da_do_anh_sang`
- `benh_da_do_nam_soi`
- `benh_da_nghe_nghiep`
- `benh_da_va_niem_mac_do_candida`
- `benh_gai_den`
- `benh_ghe`
- `benh_giang_mai`
- `benh_gut`
- `benh_hac_vong_mac_trung_tam_thanh_dich`
- `benh_hat_com`
- `benh_lao_da`
- `benh_lau`
- `benh_lichen_phang`
- `benh_loang_xuong`
- `benh_lupus_ban_do_he_thong`
- `benh_ly_truc_khuan`
- `benh_may_day`
- `benh_meniere`
- `benh_nhiem_trung_o_da_va_mo_mem`
- `benh_pellagra`
- `benh_phong`
- `benh_polyp_mui`
- `benh_porphyrin_da`
- `benh_sot_mo`
- `benh_sot_ret_khang_thuoc`
- `benh_sui_mao_ga_sinh_duc`
- `benh_tac_tinh_mach_vong_mac`
- `benh_thoai_hoa_cot_song_co`
- `benh_thoai_hoa_cot_song_that_lung`
- `benh_thuong_han`
- `benh_thuy_dau`
- `benh_tieu_chay_do_vi_khuan`
- `benh_u_te_bao_khong_lo`
- `benh_vay_ca`
- `benh_vay_nen`
- `benh_vay_phan_do_nang_long`
- `benh_viem_da_dang_herpes_cua_duhring_brocq`
- `benh_viem_khop_dang_thap`
- `benh_viem_khop_phan_ung`
- `benh_viem_khop_thieu_nien_tu_phat_the_da_khop_co_yeu_to_dang`
- `benh_viem_khop_thieu_nien_tu_phat_the_he_thong`
- `benh_viem_khop_thieu_nien_tu_phat_the_viem_cot_song_dinh`
- `benh_viem_khop_vay_nen`
- `benh_viem_mang_bo_dao_truoc_cap_tinh`
- `benh_viem_mang_hoat_dich_khop_goi_man_tinh_khong_dac_hieu`
- `benh_xo_cung_bi_toan_the`
- `benh_zona`
- `bong_nuoc_dang_pemphigus`
- `cam_lanh_thong_thuong`
- `chom_xuong_dui`
- `cum_mua`
- `dau_than_kinh_toa`
- `day_sung_long_ban_tay_ban_chan_di_truyen`
- `di_sung_nang_long`
- `do_da_toan_than`
- `glocom_goc_dong_nguyen_phat`
- `glocom_goc_mo_nguyen_phat`
- `hen_phe_quan`
- `herpes_sinh_duc`
- `hoi_chung_co_vai_canh_tay`
- `hoi_chung_dau_nhuc_so_mat`
- `hoi_chung_dau_that_lung`
- `hoi_chung_raynaud`
- `hoi_chung_vogt_koyanagi_harada`
- `hong_ban_da_dang`
- `hong_ban_nut`
- `hong_thanh_quan_viem_mui_hong_cap_tinh`
- `kho_mat_do_thieu_vitamin_a`
- `lao_thanh_quan`
- `liet_co_mo_thanh_quan`
- `liet_day_than_kinh_vii_ngoai_bien`
- `loan_duong_co_tien_trien`
- `loan_san_xo_xuong`
- `loi_mat`
- `ly_thuong_bi_bong_nuoc_bam_sinh`
- `mui_xoang_viem_mui_xoang_tre_em`
- `nam_mong`
- `nam_thanh_quan`
- `nam_toc`
- `nang_ro_giap_luoi`
- `nang_va_ro_khe_mang_i`
- `nang_va_ro_khe_mang_ii`
- `ngoai_xuong_canh_tay`
- `ngu_ngay_va_hoi_chung_tac_nghen_tho_trong_khi_ngu`
- `nhan_viem_dong_cam`
- `nhiem_chlamydia_trachomatis_sinh_duc_tiet_nieu`
- `nhot`
- `nhuoc_thi`
- `papilloma_thanh_quan`
- `papilloma_u_nhu_mui_xoang`
- `pemphigus`
- `phoi_tac_nghen_man_tinh`
- `ram_ma`
- `sam_da`
- `san_ngua`
- `sarcoidosis`
- `seo_hep_thanh_khi_quan`
- `soi`
- `sot_ret`
- `tay_chan_mieng`
- `trao_nguoc_da_day_thuc_quan`
- `trung_ca`
- `u_lanh_tinh_mui_xoang`
- `u_mem_lay`
- `u_ong_tuyen_mo_hoi`
- `u_tuyen_nuoc_bot`
- `u_xo_mach_vom_mui_hong`
- `u_xo_than_kinh`
- `vay_phan_hong_gibert`
- `viem_am_dao_do_trung_roi`
- `viem_am_ho_am_dao_do_nam_candida`
- `viem_amidan_cap_va_man_tinh`
- `viem_bi_co`
- `viem_cot_song_dinh_khop`
- `viem_da_co_dia`
- `viem_da_co_va_viem_da_co`
- `viem_da_dau`
- `viem_da_dau_chi_ruot`
- `viem_da_tiep_xuc_di_ung`
- `viem_da_tiep_xuc_do_con_trung`
- `viem_gan_gap_ngon_tay_ngon_tay_lo_xo`
- `viem_gan_vung_mom_tram_quay_co_tay`
- `viem_giac_mac_do_herpes`
- `viem_hong_cap_tinh`
- `viem_hong_man_tinh`
- `viem_ket_giac_mac_mua_xuan`
- `viem_ket_mac_cap`
- `viem_ket_mac_di_ung_cap_tinh`
- `viem_khop_thieu_nien_tu_phat_the_viem_khop_vay_nen`
- `viem_loet_giac_mac_do_amip_acanthamoeba`
- `viem_loet_giac_mac_do_nam`
- `viem_loet_giac_mac_do_vi_khuan`
- `viem_mang_bo_dao_cap_tinh_o_tre_em`
- `viem_mang_hoat_dich_khop_hang_thoang_qua`
- `viem_mui_xoang_cap_tinh`
- `viem_mui_xoang_di_ung`
- `viem_mui_xoang_do_nam`
- `viem_mui_xoang_man_tinh`
- `viem_nang_long`
- `viem_tai_giua_cap_tinh_tre_em`
- `viem_tai_giua_man_tinh`
- `viem_tai_giua_man_tinh_co_cholesteatoma`
- `viem_tai_giua_man_tre_em`
- `viem_thanh_quan_cap_tinh`
- `viem_thanh_quan_cap_tinh_ha_thanh_mon`
- `viem_thanh_quan_man_tinh`
- `viem_thi_than_kinh`
- `viem_tui_le`
- `viem_v_a_cap_va_man_tinh`
- `xop_xo_tai`

## Đối chiếu và kiểm tra

Tuấn và Huy gán nhãn độc lập. Verifier ghép `author_proposed_labels.csv` và `huy_labels.csv` theo ID, đối chiếu đầu vào với phiếu mù gốc, so các luật theo tập hợp và so các mã bệnh theo thứ tự. Chỉ những ca khớp cả ba trường mới có nhãn cuối. Hai phương án của từng ca bất đồng nằm trong `CHANGES.md`. Ghi chú nguyên văn của Huy nằm trong `huy_labels.csv`.

`manifest_freeze.json` lưu hash của bộ ca và ba CSV cùng số liệu đồng thuận. Chạy lệnh sau từ gốc repo để kiểm lại bằng venv.

```powershell
.\venv\Scripts\python.exe -B evaluation/testset_trong_tam_v1/verify_trong_tam_v1.py
```
