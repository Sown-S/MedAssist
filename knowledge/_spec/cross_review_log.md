---
schema: okf_review_log_v1
---

# BIÊN BẢN RÀ SOÁT CHÉO KHO TRI THỨC OKF & BỘ CA KIỂM THỬ (SPRINT 3)

## 1. Thông số Kho Tri thức OKF Hiện hành (Xác nhận qua `check_okf.py`)
- **Tổng số nguồn tài liệu Bộ Y tế (`okf_source_v1`)**: `7` quyết định chuyên môn.
- **Tổng số triệu chứng chuẩn hóa (`okf_symptom_catalog_v1`)**: `60` triệu chứng nguyên tử (độ phủ sử dụng 100%, 0 triệu chứng thừa).
- **Tổng số bệnh lý lâm sàng (`okf_condition_v1`)**: `44` bệnh thuộc `3` nhóm chuyên khoa:
  - `infectious`: **4** bệnh
  - `musculoskeletal`: **38** bệnh
  - `respiratory`: **2** bệnh
- **Tổng số luật phân loại an toàn (`okf_triage_rule_v1`)**: `11` luật (`9` luật Cờ đỏ `RED_FLAG` và `2` luật Sàn ưu tiên cao `PRIORITY_FLOOR`).

## 2. Nguyên tắc Rà soát chéo (Tuân thủ Nguyên tắc Vàng #5 & #6 - Quy định v5)
- **Độc lập giữa người biên soạn và người rà soát**: Toàn bộ 44 bệnh lý, 60 triệu chứng chuẩn hóa và 11 luật phân loại an toàn được kiểm tra tự động qua `check_okf.py` (`0 ERR, 0 WARN, 0 INFO`) và đối chiếu chéo với tài liệu gốc của Bộ Y tế.
- **Phân tách gán nhãn bộ ca kiểm thử (`evaluation/testset/`)**: Người soạn tri thức OKF của một nhóm bệnh không tự phê duyệt nhãn bộ ca test của nhóm bệnh đó mà có thành viên khác trong nhóm (`Huy`, `Sơn`, `Tuấn`) rà soát chéo (`cross_reviewer`).
- **Đóng băng bộ kiểm thử (`Testset Freeze`)**: Trước lần chạy đánh giá thực nghiệm đầu tiên, toàn bộ các tệp trong `evaluation/testset/` được tính mã băm mật mã học **SHA-256** lưu trong `evaluation/testset/manifest_freeze.json` và gắn thẻ Git (`git tag testset-v1.0-frozen`).

## 3. Bảng Phân công & Kết quả Rà soát Chéo Kho Tri Thức (`okf_vault/`)

| Nhóm bệnh (`disease_group`) | Số lượng bệnh | Nguồn pháp lý Bộ Y tế | Người biên soạn OKF | Người rà soát chéo | Kết quả `check_okf.py` |
| :--- | :---: | :--- | :---: | :---: | :---: |
| **Truyền nhiễm (`infectious`)** | **4** | QĐ 1327/QĐ-BYT, QĐ 1840/QĐ-BYT, QĐ 2699/QĐ-BYT, QĐ 292/QĐ-BYT | Tuấn | Sơn | **Đạt (0 lỗi)** |
| **Cơ xương khớp (`musculoskeletal`)** | **38** | QĐ 361/QĐ-BYT (Hướng dẫn chẩn đoán và điều trị bệnh Cơ xương khớp) | Tuấn | Sơn & Huy | **Đạt (0 lỗi)** |
| **Hô hấp (`respiratory`)** | **2** | QĐ 4562/QĐ-BYT (BPTNMT 2018), QĐ 1851/QĐ-BYT (Hen phế quản 2020) | Tuấn | Huy | **Đạt (0 lỗi)** |
| **Tổng cộng** | **44 bệnh** | **7 nguồn + 60 triệu chứng + 11 luật phân loại** | **Tuấn** | **Sơn & Huy** | **0 ERR, 0 WARN** |
