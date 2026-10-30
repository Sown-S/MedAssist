# BIÊN BẢN RÀ SOÁT CHÉO KHO TRI THỨC OKF & BỘ CA KIỂM THỬ (SPRINT 3)

## 1. Thông số Kho Tri thức OKF Hiện hành (đọc trực tiếp từ `okf_vault/`)
- **Tổng số nguồn tài liệu Bộ Y tế (`okf_source_v1`)**: `11` tài liệu.
- **Tổng số triệu chứng chuẩn hóa (`okf_symptom_catalog_v1`)**: `99` triệu chứng nguyên tử.
- **Tổng số bệnh lý lâm sàng (`okf_condition_v1`)**: `124` bệnh thuộc `7` nhóm chuyên khoa:
  - `dermatology`: **3** bệnh
  - `ent`: **38** bệnh
  - `gastrointestinal`: **1** bệnh
  - `infectious`: **14** bệnh
  - `musculoskeletal`: **55** bệnh
  - `ophthalmology`: **11** bệnh
  - `respiratory`: **2** bệnh
- **Tổng số luật phân loại an toàn (`okf_triage_rule_v1`)**: `11` luật (`9` luật Cờ đỏ `RED_FLAG` và `2` luật Sàn ưu tiên cao `PRIORITY_FLOOR`).

## 2. Nguyên tắc Rà soát chéo (Tuân thủ Nguyên tắc Vàng #5 & #6 - Quy định v5)
- **Kiểm tra tự động**: kho tri thức được kiểm tra qua `check_okf.py` (kết quả: 0 ERR, 0 WARN, 0 INFO). Mọi bệnh đều có >= 4 quan hệ triệu chứng chuẩn hóa.
- **Phân tách gán nhãn bộ ca kiểm thử (`evaluation/testset/`)**: Người soạn tri thức OKF của một nhóm bệnh không tự phê duyệt nhãn bộ ca test của nhóm bệnh đó mà có thành viên khác (`Huy`, `Sơn`, `Tuấn`, `Anh`) rà soát chéo (`cross_reviewer`).
- **Đóng băng bộ kiểm thử (`Testset Freeze`)**: Trước lần chạy đánh giá thực nghiệm đầu tiên, toàn bộ tệp trong `evaluation/testset/` được tính mã băm **SHA-256** lưu trong `evaluation/testset/manifest_freeze.json` và gắn thẻ Git.

## 3. Bảng Phân công & Kết quả Rà soát Chéo Kho Tri Thức (`okf_vault/`)

| Nhóm bệnh (`disease_group`) | Số lượng bệnh | Nguồn pháp lý Bộ Y tế | Người biên soạn OKF | Người rà soát chéo | Số ca test (trích xuất / lâm sàng) |
| :--- | :---: | :--- | :---: | :---: | :---: |
| **Da liễu (`dermatology`)** | **3** | QĐ 361/QĐ-BYT, QĐ 75/QĐ-BYT | Sơn | Tuấn & Huy | 3 / 2 |
| **Tai mũi họng (`ent`)** | **38** | QĐ 5643/QĐ-BYT | Huy | Tuấn & Anh | 3 / 2 |
| **gastrointestinal (`gastrointestinal`)** | **1** | QĐ 5643/QĐ-BYT | (chưa phân công) | (chưa phân công) | 0 / 0 |
| **Truyền nhiễm (`infectious`)** | **14** | QĐ 1327/QĐ-BYT, QĐ 1840/QĐ-BYT, QĐ 2699/QĐ-BYT, QĐ 292/QĐ-BYT, QĐ 5642/QĐ-BYT, QĐ 75/QĐ-BYT | Tuấn | Sơn | 6 / 4 |
| **Cơ xương khớp (`musculoskeletal`)** | **55** | QĐ 361/QĐ-BYT, QĐ 40/QĐ-BYT, QĐ 5642/QĐ-BYT, QĐ 5643/QĐ-BYT | Tuấn | Sơn & Huy | 13 / 7 |
| **Nhãn khoa (`ophthalmology`)** | **11** | QĐ 40/QĐ-BYT | Anh | Huy & Sơn | 2 / 1 |
| **Hô hấp (`respiratory`)** | **2** | QĐ 3942/QĐ-BYT, QĐ 4562/QĐ-BYT | Tuấn | Huy | 3 / 3 |
| **Tổng cộng** | **124 bệnh** | **11 nguồn + 99 triệu chứng + 11 luật** | | | **30 / 19** |

## 4. Ca tạm thời ẩn khỏi testset do chưa nạp tài liệu tương ứng

- `CLIN-012`: condition_code chưa có: thoai_hoa_khop_goi, u_sun_mang_hoat_dich
- `CLIN-016`: condition_code chưa có: nhuoc_co
- `CLIN-021`: condition_code chưa có: glocom_goc_dong_nguyen_phat, glocom_goc_mo_nguyen_phat
