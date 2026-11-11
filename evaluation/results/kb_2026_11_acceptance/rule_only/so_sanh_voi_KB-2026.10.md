# So sánh RuleOnly KB-2026.10 → KB-2026.11

Cùng hash testset v1.3, 82 ca. Chạy KB-2026.11 đúng một lần; không sửa KB theo kết quả. Không chạy Full hoặc trích xuất.

| Chỉ số | KB-2026.10 | KB-2026.11 |
|---|---:|---:|
| Recall cờ đỏ (48 ca) | 1.0 | 1.0 |
| Báo cờ đỏ nhầm | 0 | 0 |
| Mức ưu tiên đúng | 1.0 | 1.0 |
| Luật precision | 1.0 | 1.0 |
| Luật recall | 1.0 | 1.0 |
| Luật F1 | 1.0 | 1.0 |
| DDx top-1 (18 ca) | 0.8333333333333334 | 0.8333333333333334 |
| DDx top-3 (18 ca) | 0.9444444444444444 | 0.9444444444444444 |

Các chỉ số trên không giảm và không tăng. DDx top-1 = 15/18, top-3 = 17/18. Các giá trị thập phân trên chép nguyên từ results.json, không thay bằng giá trị phần trăm đã làm tròn.

Giới hạn: chỉ 18 ca có nhãn DDx, phủ 27/153 bệnh (đợt trước 27/169). Không tuyên bố đã đánh giá đủ toàn bộ KB. Nhãn v1.3 vẫn có các vấn đề đã rà; giữ nguyên để tránh điều chỉnh theo điểm.

Hai lượt dùng phiên bản server khác nhau: 0.2.2 → 0.2.4. Đây là so sánh hai báo cáo lịch sử, không phải thí nghiệm cô lập duy nhất biến KB. Không suy diễn thay đổi thứ hạng là chỉ do KB.

## Thay đổi thứ hạng cụ thể

- CLIN-002: soi, cum_mua, hoi_chung_dress → soi, cum_mua, viem_mui_xoang_di_ung
- CLIN-004: benh_sot_ret_khang_thuoc, sot_ret, hoi_chung_dress → benh_sot_ret_khang_thuoc, sot_ret, viem_hong_cap_tinh
- CLIN-005: phoi_tac_nghen_man_tinh, hen_phe_quan, viem_phu_ne_thanh_thiet_cap_tinh → phoi_tac_nghen_man_tinh, hen_phe_quan, viem_thanh_quan_cap_tinh
- CLIN-017: viem_tai_giua_man_tinh, chong_mat, viem_tai_giua_man_tinh_co_cholesteatoma → viem_tai_giua_man_tinh, viem_tai_giua_man_tre_em, viem_tai_giua_man_tinh_co_cholesteatoma
- CLIN-078: nang_va_ro_khe_mang_ii, viem_hong_cap_tinh, ngat_mui → nang_va_ro_khe_mang_ii, viem_hong_cap_tinh, hong_thanh_quan_viem_mui_hong_cap_tinh
