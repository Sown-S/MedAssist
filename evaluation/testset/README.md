# Bộ Dữ Liệu Kiểm Thử Đóng Băng (Frozen Evaluation Testset testset-v1.2-frozen)

## 1. Thông số Kho Tri Thức Tham Chiếu (`okf_vault`)
- **Tổng số bệnh**: `199` bệnh (`dermatology`: 63, `ent`: 56, `infectious`: 17, `musculoskeletal`: 32, `ophthalmology`: 29, `respiratory`: 2)
- **Tổng số triệu chứng**: `98` triệu chứng nguyên tử
- **Tổng số luật phân loại**: `11` luật (`9` RED_FLAG, `2` PRIORITY_FLOOR)
- **Tổng số nguồn Bộ Y tế**: `11` tài liệu

## 2. Danh sách tệp trong `evaluation/testset/`
1. **`symptom_extraction_testset.jsonl`** (29 ca viết tay độc lập): Kiểm thử module trích xuất triệu chứng từ câu mô tả tự do tiếng Việt.
2. **`clinical_cases_labeled.jsonl`** (20 ca lâm sàng chuẩn hóa có gán nhãn chéo): Kiểm thử toàn trình Node 1 (Cờ đỏ & Mức ưu tiên) và Node 2-3 (Top chẩn đoán phân biệt).
3. **`manifest_freeze.json`**: Lưu mã băm **SHA-256** để đóng băng bộ test trước lần đánh giá đầu tiên.
4. **`cross_review_log.md`**: Biên bản rà soát chéo kho tri thức OKF và bộ ca kiểm thử.

## 3. Thông tin Đóng băng (Hash & Git Tag)
- **Git Tag**: `testset-v1.2-frozen`
- **Combined SHA-256**: `b75141885fe33216de882110a2126ca060cd54c9467556275531a78efb8078c5`
  - `symptom_extraction_testset.jsonl`: `21c778cd09a9e11091428ac7cdffb1d7ff42f960648a8106abac20f6901de2a7`
  - `clinical_cases_labeled.jsonl`: `624fe91ea1edaf51eab6619cd9d0ef17b523cf497f0eeb9f7a135b0186c66134`
