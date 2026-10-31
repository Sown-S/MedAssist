# BIÊN BẢN RÀ SOÁT CHÉO KHO TRI THỨC OKF & BỘ CA KIỂM THỬ (SPRINT 3)

## 1. Thông số Kho Tri thức OKF Hiện hành (đọc trực tiếp từ `okf_vault/`)
- **Tổng số nguồn tài liệu Bộ Y tế (`okf_source_v1`)**: `11` tài liệu.
- **Tổng số triệu chứng chuẩn hóa (`okf_symptom_catalog_v1`)**: `98` triệu chứng nguyên tử.
- **Tổng số bệnh lý lâm sàng (`okf_condition_v1`)**: `199` bệnh thuộc `6` nhóm chuyên khoa:
  - `dermatology`: **63** bệnh
  - `ent`: **56** bệnh
  - `infectious`: **17** bệnh
  - `musculoskeletal`: **32** bệnh
  - `ophthalmology`: **29** bệnh
  - `respiratory`: **2** bệnh
- **Tổng số luật phân loại an toàn (`okf_triage_rule_v1`)**: `11` luật (`9` luật Cờ đỏ `RED_FLAG` và `2` luật Sàn ưu tiên cao `PRIORITY_FLOOR`).

## 2. Nguyên tắc Rà soát chéo (Tuân thủ Nguyên tắc Vàng #5 & #6 - Quy định v5)
- **Kiểm tra tự động**: kho tri thức được kiểm tra qua `check_okf.py` (kết quả: 0 ERR, 0 WARN, 0 INFO). Mọi bệnh đều có >= 4 quan hệ triệu chứng chuẩn hóa.
- **Phân tách gán nhãn bộ ca kiểm thử (`evaluation/testset/`)**: Người soạn tri thức OKF của một nhóm bệnh không tự phê duyệt nhãn bộ ca test của nhóm bệnh đó mà có thành viên khác (`Huy`, `Sơn`, `Tuấn`, `Anh`) rà soát chéo (`cross_reviewer`).
- **Đóng băng bộ kiểm thử (`Testset Freeze`)**: Trước lần chạy đánh giá thực nghiệm đầu tiên, toàn bộ tệp trong `evaluation/testset/` được tính mã băm **SHA-256** lưu trong `evaluation/testset/manifest_freeze.json` và gắn thẻ Git.

## 3. Bảng Phân công & Kết quả Rà soát Chéo Kho Tri Thức (`okf_vault/`)

| Nhóm bệnh (`disease_group`) | Số lượng bệnh | Nguồn pháp lý Bộ Y tế | Người biên soạn OKF | Người rà soát chéo | Số ca test (trích xuất / lâm sàng) |
| :--- | :---: | :--- | :---: | :---: | :---: |
| **Da liễu (`dermatology`)** | **63** | QĐ 75/QĐ-BYT | Sơn | Tuấn & Huy | 3 / 2 |
| **Tai mũi họng (`ent`)** | **56** | QĐ 5643/QĐ-BYT | Huy | Tuấn & Anh | 3 / 2 |
| **Truyền nhiễm (`infectious`)** | **17** | QĐ 1327/QĐ-BYT, QĐ 1840/QĐ-BYT, QĐ 2699/QĐ-BYT, QĐ 292/QĐ-BYT, QĐ 5642/QĐ-BYT | Tuấn | Sơn | 6 / 4 |
| **Cơ xương khớp (`musculoskeletal`)** | **32** | QĐ 361/QĐ-BYT | Tuấn | Sơn & Huy | 12 / 7 |
| **Nhãn khoa (`ophthalmology`)** | **29** | QĐ 40/QĐ-BYT | Anh | Huy & Sơn | 2 / 2 |
| **Hô hấp (`respiratory`)** | **2** | QĐ 3942/QĐ-BYT, QĐ 4562/QĐ-BYT | Tuấn | Huy | 3 / 3 |
| **Tổng cộng** | **199 bệnh** | **11 nguồn + 98 triệu chứng + 11 luật** | | | **29 / 20** |

## 4. Ca tạm thời ẩn khỏi testset do chưa nạp tài liệu tương ứng

- `EXT-015`: Thiếu mã triệu chứng trong catalog hiện hành: myasthenic_ptosis_diplopia_fatigue
- `CLIN-012`: condition_code chưa có: thoai_hoa_khop_goi, u_sun_mang_hoat_dich
- `CLIN-016`: symptom_code chưa có: myasthenic_ptosis_diplopia_fatigue; condition_code chưa có: nhuoc_co
