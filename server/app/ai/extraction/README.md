# Tích hợp trích xuất theo cụm

Nhánh phát triển, chưa bật mặc định hoặc nghiệm thu release. Giữ một model
Gemma hiện có; không đổi DB/API. Triệu chứng gợi ý luôn cần điều dưỡng xác nhận.

## Điểm gọi chung

`dispatch.ExtractionOptions(strategy="legacy", per_phrase_limit=4)` chọn
`legacy` hoặc `phrases`. K là số nguyên dương; 4 là giá trị thử nghiệm.

```python
from app.ai.extraction.dispatch import ExtractionOptions, run_extraction
from app.ai.extraction.candidate_index import CandidateIndexCache

cache = CandidateIndexCache()  # dùng lại giữa các lượt, chỉ giữ chỉ mục tri thức
options = ExtractionOptions(strategy="phrases", per_phrase_limit=4)
result = await run_extraction(
    text, pinned_reader, llm_client, db,
    gate_state=gate, identifiers=known_identifiers,
    timeout_seconds=remaining_seconds, options=options, cache=cache,
)
```

Caller ghim `SnapshotReader(reader.refresh())`, chạy Node 1 trước, truyền đầy đủ
định danh cần che và ngân sách còn lại. Worker trừ thời gian chờ từ queued_at
trong hạn 30 giây. Dispatcher không tự retry hoặc chuyển sang legacy khi lỗi.

Kết quả có `strategy`, `prompt_version`, `completed`, `failure_code`, `suggestions`.
Nhánh phrases phân biệt rỗng hợp lệ (`completed=True`) với thất bại (`False`).
Legacy trả list nên rỗng được đánh dấu `completed=None`,
`LEGACY_EMPTY_UNCLASSIFIED`: chưa biết là không triệu chứng hay lỗi/timeout.
Worker legacy giữ hành vi cũ; công cụ đo không được coi trạng thái chưa biết là
hoàn tất kỹ thuật. Hoàn tất kỹ thuật không chứng minh chọn đúng nghĩa/trạng thái.

## Phần cần nối ở settings và CLI

- Settings: `AI_EXTRACTION_STRATEGY` chỉ nhận legacy/phrases, default legacy;
  `AI_EXTRACTION_CANDIDATES_PER_PHRASE` là số nguyên dương. Worker đã có điểm đọc;
  chỉ đặt biến môi trường chưa có hiệu lực nếu core settings chưa khai báo.
- `scripts.run_eval.run_extraction` hiện vẫn gọi extractor legacy. Cần chuyển
  sang dispatcher, lấy phiên bản prompt/strategy từ kết quả thực tế, lưu trạng
  thái hoàn tất/lý do lỗi riêng. Không tính ca lỗi là exact chỉ vì cả hai list rỗng.
- Giữ công thức precision/recall, không bỏ ca thất bại khỏi mẫu số. Ghi model,
  strategy/K và snapshot cùng số đo. Đo trực tiếp không gồm hàng đợi/ghi worker,
  không gọi số đo đó là E2E.
- Dùng `--extraction-cases` với ca phát triển riêng; frozen chỉ chấm cuối.

## Luồng phrases và giới hạn

Che PII → tách span → truy xuất K ứng viên mỗi span từ KnowledgeReader Active →
giữ cặp phủ định phụ thuộc cùng nhóm đọc, hợp đủ ứng viên → một lần Gemma chọn
mã → kiểm schema/enum/mâu thuẫn/Active → HITL. Chuỗi từ ba vế giữ cách tách cũ.
Không thêm alias, không tự gán trạng thái bằng phép ghép nhóm.

Các ca phát triển và công cụ đo ở `tests/unit/ai/`. Lượt 36 ca ở giai đoạn ghép
phủ định đạt 32/36 exact, recall mã+trạng thái 95,59%, p95 10,94 s; còn sai không
dấu, thiếu mã cho cách nói thường, bỏ triệu chứng phủ định và mã thừa ở một ca
bình thường. Source cuối thêm giới hạn cặp: 10 ca phối hợp mới tăng 5/10 → 8/10,
precision/recall 85,71%, p95 8,69 s. Chưa đo lại đủ 36 ca bằng source cuối; unit
test xác nhận giới hạn cặp không đổi grouping của bộ 36. Đây là số đo phát triển,
chưa phải chấm frozen hoặc kiểm độ ổn định/load test.

Chỉ bật mặc định sau review, kiểm worker/API trên DB `medassist_test`, và recall
29 ca frozen không kém baseline với p95 dưới 30 giây trên server.
