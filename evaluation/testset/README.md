# Bộ Dữ Liệu Kiểm Thử Đóng Băng (Frozen Evaluation Testset testset-v1.0-frozen)

## 1. Thông số Kho Tri Thức Tham Chiếu (`okf_vault`)
- **Tổng số bệnh**: `84` bệnh (`dermatology`: 3, `ent`: 50, `infectious`: 3, `musculoskeletal`: 26, `respiratory`: 2)
- **Tổng số triệu chứng**: `86` triệu chứng nguyên tử
- **Tổng số luật phân loại**: `11` luật (`9` RED_FLAG, `2` PRIORITY_FLOOR)
- **Tổng số nguồn Bộ Y tế**: `9` tài liệu

## 2. Danh sách tệp trong `evaluation/testset/`
1. **`symptom_extraction_testset.jsonl`** (19 ca viết tay độc lập): Kiểm thử module trích xuất triệu chứng từ câu mô tả tự do tiếng Việt.
2. **`clinical_cases_labeled.jsonl`** (13 ca lâm sàng chuẩn hóa có gán nhãn chéo): Kiểm thử toàn trình Node 1 (Cờ đỏ & Mức ưu tiên) và Node 2-3 (Top chẩn đoán phân biệt).
3. **`manifest_freeze.json`**: Lưu mã băm **SHA-256** để đóng băng bộ test trước lần đánh giá đầu tiên.

## 3. Thông tin Đóng băng (Hash & Git Tag)
- **Git Tag**: `testset-v1.0-frozen`
- **Combined SHA-256**: `5f6a9cdf6ecac3b1e8792bb7e0f3f0a94e4f49d3b2f80a73b8c219c204206ee9`
  - `symptom_extraction_testset.jsonl`: `3d1d2dedfd0c7999532ae75827fcd2b042e9e355820fa0fc09c24e4ac842c72a`
  - `clinical_cases_labeled.jsonl`: `3a0426c516ac296c0520a2d39e9e71d5030d37fb652abbc7c42b415a25c2082e`
