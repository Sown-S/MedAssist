---
schema: okf_review_log_v1
---

# BIÊN BẢN RÀ SOÁT CHÉO KHO TRI THỨC OKF & BỘ CA KIỂM THỬ (SPRINT 3)

## 1. Thông số Kho Tri thức OKF Hiện hành (đọc trực tiếp từ `okf_vault/`)
- **Tổng số nguồn tài liệu Bộ Y tế (`okf_source_v1`)**: `9` tài liệu.
- **Tổng số triệu chứng chuẩn hóa (`okf_symptom_catalog_v1`)**: `86` triệu chứng nguyên tử.
- **Tổng số bệnh lý lâm sàng (`okf_condition_v1`)**: `84` bệnh thuộc `5` nhóm chuyên khoa:
  - `dermatology`: **3** bệnh
  - `ent`: **50** bệnh
  - `infectious`: **3** bệnh
  - `musculoskeletal`: **26** bệnh
  - `respiratory`: **2** bệnh
- **Tổng số luật phân loại an toàn (`okf_triage_rule_v1`)**: `11` luật (`9` luật Cờ đỏ `RED_FLAG` và `2` luật Sàn ưu tiên cao `PRIORITY_FLOOR`).

## 2. Nguyên tắc Rà soát chéo (Tuân thủ Nguyên tắc Vàng #5 & #6 - Quy định v5)
- **Kiểm tra tự động**: kho tri thức được kiểm tra qua `check_okf.py` (kết quả: 0 ERR, 0 WARN, 0 INFO). Bệnh có < 3 quan hệ triệu chứng không được trích xuất vào vault.
- **Phân tách gán nhãn bộ ca kiểm thử (`evaluation/testset/`)**: Người soạn tri thức OKF của một nhóm bệnh không tự phê duyệt nhãn bộ ca test của nhóm bệnh đó mà có thành viên khác (`Huy`, `Sơn`, `Tuấn`) rà soát chéo (`cross_reviewer`).
- **Đóng băng bộ kiểm thử (`Testset Freeze`)**: Trước lần chạy đánh giá thực nghiệm đầu tiên, toàn bộ tệp trong `evaluation/testset/` được tính mã băm **SHA-256** lưu trong `evaluation/testset/manifest_freeze.json` và gắn thẻ Git.

## 3. Bảng Phân công & Kết quả Rà soát Chéo Kho Tri Thức (`okf_vault/`)

| Nhóm bệnh (`disease_group`) | Số lượng bệnh | Nguồn pháp lý Bộ Y tế | Người biên soạn OKF | Người rà soát chéo | Số ca test (trích xuất / lâm sàng) |
| :--- | :---: | :--- | :---: | :---: | :---: |
| **Da liễu (`dermatology`)** | **3** | QĐ 75/QĐ-BYT | (chưa phân công) | (chưa phân công) | 0 / 0 |
| **Tai mũi họng (`ent`)** | **50** | QĐ 5643/QĐ-BYT | (chưa phân công) | (chưa phân công) | 0 / 0 |
| **Truyền nhiễm (`infectious`)** | **3** | QĐ 1327/QĐ-BYT, QĐ 1840/QĐ-BYT, QĐ 2699/QĐ-BYT | Tuấn | Sơn | 4 / 3 |
| **Cơ xương khớp (`musculoskeletal`)** | **26** | QĐ 361/QĐ-BYT | Tuấn | Sơn & Huy | 12 / 7 |
| **Hô hấp (`respiratory`)** | **2** | QĐ 1851/QĐ-BYT, QĐ 4562/QĐ-BYT | Tuấn | Huy | 3 / 3 |
| **Tổng cộng** | **84 bệnh** | **9 nguồn + 86 triệu chứng + 11 luật** | | | **19 / 13** |

> **Lưu ý độ phủ**: nhóm chưa có ca kiểm thử nào: `dermatology`, `ent`.

## 4. Ca đã loại khỏi testset do kho tri thức thay đổi

- `EXT-011`: Dùng mã triệu chứng knee_effusion_crepitus_locking / morning_stiffness_under_30m không còn trong catalog.
- `CLIN-003`: Bệnh tay_chan_mieng bị loại khỏi vault (ít hơn 3 quan hệ triệu chứng).
- `CLIN-012`: Bệnh thoai_hoa_khop_goi / u_sun_mang_hoat_dich và 2 mã triệu chứng của ca không còn trong vault.
- `CLIN-016`: Bệnh nhuoc_co không còn trong vault.
