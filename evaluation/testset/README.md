# Bộ test đóng băng cho đánh giá NCKH (`testset-v1.1-frozen`)

Bộ ca có gán nhãn dùng để đo chất lượng module AI cho báo cáo đồ án và bài báo NCKH. Phụ trách: Tuấn.

**Quy tắc đóng băng** (Quy định thư mục v6, nguyên tắc vàng #6):

- Không sửa file `.jsonl` sau khi đóng băng. Ca sai nhãn hoặc bệnh bị bỏ khỏi kho tri thức thì **loại** (ghi vào `retired_cases`
  của `manifest_freeze.json`), không sửa tại chỗ. Thêm ca mới thì làm bộ đóng băng phiên bản mới.
- Không chỉnh luật, prompt hay tri thức dựa trên kết quả của bộ này, để số đo còn độc lập.
- Bộ ca demo (`demo_cases_*.jsonl`) chỉ dùng smoke test, không dùng để tính số đo.

## Kho tri thức tham chiếu

Đóng băng ngày 30/10/2026 trên bản tri thức `KB-2026.01` của PR #61:

| Thông số | Giá trị |
|---|---|
| Bệnh | 124 (`musculoskeletal` 55, `ent` 38, `infectious` 14, `ophthalmology` 11, `dermatology` 3, `respiratory` 2, `gastrointestinal` 1) |
| Triệu chứng nguyên tử | 99 |
| Luật phân loại | 11 (9 `RED_FLAG`, 2 `PRIORITY_FLOOR`) |
| Nguồn Bộ Y tế | 11 văn bản |

## Các file

| File | Số ca | Dùng để đo |
|---|---|---|
| `symptom_extraction_testset.jsonl` | 30 | Trích xuất triệu chứng từ lời kể tự do tiếng Việt |
| `clinical_cases_labeled.jsonl` | 19 | Toàn pipeline: Node 1 (cờ đỏ, mức ưu tiên) và Node 2–3 (top chẩn đoán phân biệt) |
| `manifest_freeze.json` | | Phiên bản, ảnh chụp kho tri thức, SHA-256 từng file, ca đã loại |
| `cross_review_log.md` | | Biên bản rà soát chéo tri thức và nhãn |

### `symptom_extraction_testset.jsonl`

```json
{"id": "EXT-001", "disease_group": "infectious",
 "clinical_note": "Bệnh nhân sốt cao đột ngột 39.5 độ từ tối qua, người rét run, ...",
 "expected_symptoms": {"fever_high": "PRESENT", "chills_rigors": "PRESENT", "rhinorrhea_nasal_congestion": "ABSENT"}}
```

`expected_symptoms` liệt kê các mã có nhắc tới (có hoặc phủ định) trong lời kể.

### `clinical_cases_labeled.jsonl`

| Trường | Ý nghĩa |
|---|---|
| `case_id`, `disease_group` | Mã ca, nhóm bệnh |
| `age_years`, `vital_signs`, `symptoms` | Đầu vào đã xác nhận, cùng định dạng `input_features` của pipeline (8 khóa sinh hiệu, triệu chứng `PRESENT/ABSENT/UNKNOWN`) |
| `expected_priority`, `expected_triggered_rules` | Nhãn cho Node 1 |
| `expected_top_conditions` | Các bệnh chấp nhận được trong top chẩn đoán |
| `author`, `cross_reviewer`, `review_status` | Người gán nhãn, người rà soát chéo (khác người soạn tri thức nhóm bệnh đó), trạng thái (`APPROVED`) |

## Kiểm tra bộ test chưa bị sửa

So SHA-256 từng file với `manifest_freeze.json`. Repo checkout trên Windows với `core.autocrlf=true` sẽ đổi xuống dòng thành CRLF,
nên băm nội dung trong Git thay vì file trên đĩa:

```bash
git show testset-v1.1-frozen:evaluation/testset/clinical_cases_labeled.jsonl | sha256sum
git show testset-v1.1-frozen:evaluation/testset/symptom_extraction_testset.jsonl | sha256sum
```

Tag `testset-v1.1-frozen` đánh dấu commit đóng băng; tag cũ `testset-v1.0-frozen` (bộ trước khi kho tri thức mở rộng) chỉ để đối chiếu.
Tag đã được gắn lại một lần, nên máy đã fetch tag từ trước cần lấy lại: `git fetch origin --tags --force`.

Có thể kiểm tra nhanh trên bản đang checkout bằng `git show HEAD:evaluation/testset/<file> | sha256sum`.

## Chạy đánh giá

- Dùng CSDL riêng `medassist_eval` (đặt `MEDASSIST_CREATE_EVAL_DB=1` trong `deploy/.env` trước khi tạo volume), nạp đúng bản tri thức
  ở trên bằng `scripts.import_okf`, để không lẫn dữ liệu dev.
- Hàm `evaluate_case_offline` trong `server/app/services/assessment_service.py` chạy pipeline không qua HTTP cho từng ca:
  `mode="RuleOnly"` (Node 1 + Node 2 tất định) hoặc `mode="Full"` (thêm LLM, cần `llm_client`).
- Chỉ số báo cáo: recall cờ đỏ (chỉ số duy nhất có ngưỡng cam kết trong Proposal), độ chính xác mức ưu tiên,
  top-k chẩn đoán phân biệt, precision / recall / F1 của trích xuất triệu chứng. Trang Báo cáo trong app không hiện các chỉ số này
  vì phòng khám không có nhãn đúng.
