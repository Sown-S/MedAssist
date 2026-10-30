# Bộ Dữ Liệu Kiểm Thử Đóng Băng (Frozen Evaluation Testset testset-v1.1-frozen)

## 1. Thông số Kho Tri Thức Tham Chiếu (`okf_vault`)
- **Tổng số bệnh**: `124` bệnh (`dermatology`: 3, `ent`: 38, `gastrointestinal`: 1, `infectious`: 14, `musculoskeletal`: 55, `ophthalmology`: 11, `respiratory`: 2)
- **Tổng số triệu chứng**: `99` triệu chứng nguyên tử
- **Tổng số luật phân loại**: `11` luật (`9` RED_FLAG, `2` PRIORITY_FLOOR)
- **Tổng số nguồn Bộ Y tế**: `11` tài liệu

## 2. Danh sách tệp trong `evaluation/testset/`
1. **`symptom_extraction_testset.jsonl`** (30 ca viết tay độc lập): Kiểm thử module trích xuất triệu chứng từ câu mô tả tự do tiếng Việt.
2. **`clinical_cases_labeled.jsonl`** (19 ca lâm sàng chuẩn hóa có gán nhãn chéo): Kiểm thử toàn trình Node 1 (Cờ đỏ & Mức ưu tiên) và Node 2-3 (Top chẩn đoán phân biệt).
3. **`manifest_freeze.json`**: Lưu mã băm **SHA-256** để đóng băng bộ test trước lần đánh giá đầu tiên.

## 3. Thông tin Đóng băng (Hash & Git Tag)
- **Git Tag**: `testset-v1.1-frozen`
- **Combined SHA-256**: `325af92284417727f9a471c90e98ad3e4fb89dcdcf9356977d4fd2f69543404c`
  - `symptom_extraction_testset.jsonl`: `02851c6e12b49ac6244074a84ced23af37c4960b3ac28709d5b9ceda244f3363`
  - `clinical_cases_labeled.jsonl`: `f209b7cdf5730e3ba080245590c2e9f5f50aba935a2a6151e2e6611881bff36a`
