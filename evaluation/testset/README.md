# Bộ Dữ Liệu Kiểm Thử Đóng Băng (Frozen Evaluation Testset v1.0)

## 1. Thông số Kho Tri Thức Tham Chiếu (`okf_vault`)
- **Tổng số bệnh**: `44` bệnh (`infectious`: 4, `musculoskeletal`: 38, `respiratory`: 2)
- **Tổng số triệu chứng**: `60` triệu chứng nguyên tử
- **Tổng số luật phân loại**: `11` luật (`9` RED_FLAG, `2` PRIORITY_FLOOR)
- **Tổng số nguồn Bộ Y tế**: `7` quyết định

## 2. Danh sách tệp trong `evaluation/testset/`
1. **`symptom_extraction_testset.jsonl`** (20 ca viết tay độc lập): Kiểm thử module trích xuất triệu chứng từ câu mô tả tự do tiếng Việt.
2. **`clinical_cases_labeled.jsonl`** (16 ca lâm sàng chuẩn hóa có gán nhãn chéo): Kiểm thử toàn trình Node 1 (Cờ đỏ & Mức ưu tiên) và Node 2-3 (Top chẩn đoán phân biệt).
3. **`manifest_freeze.json`**: Lưu mã băm mật mã học **SHA-256** để đóng băng bộ test trước lần đánh giá đầu tiên.

## 3. Thông tin Đóng băng (Hash & Git Tag)
- **Git Tag**: `testset-v1.0-frozen`
- **Combined SHA-256**: `74dc489a5857a6647250558e8ede3e6da9b2930c8a00289e65bbe3387ef164e7`
  - `symptom_extraction_testset.jsonl`: `abefc1859d8abd4e4617ea910baefc12e1015defbb7990c35efef8dbfdc4d972`
  - `clinical_cases_labeled.jsonl`: `09f27316a1d7faa0fe5380beedec4aade662af13b4ca0b378fa800da9904dee8`
