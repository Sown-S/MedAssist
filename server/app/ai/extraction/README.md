# Tích hợp trích xuất theo cụm

Trích xuất theo cụm dùng một model Gemma. Triệu chứng gợi ý luôn cần điều dưỡng
xác nhận.

## Điểm gọi chung

`dispatch.ExtractionOptions()` chọn `phrases` với K=4. Truyền
`strategy="legacy"` để chọn cách gửi toàn catalog. K là số nguyên dương.

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

Từ 4 nhóm chọn mã, phrases dùng `extraction-phrases-compact-v3`: Gemma trả
ID ngắn và trạng thái, sau đó code giải mã theo ứng viên riêng của từng nhóm
trước validation Active/HITL. Các cụm trùng hoàn toàn cả nội dung, ngữ cảnh và
ứng viên dùng chung lựa chọn; mọi span gốc vẫn được kiểm khi giải mã. Định nghĩa
và câu ngữ cảnh chỉ gửi một lần. Dưới 4 nhóm tiếp tục dùng prompt v2.
Giữ một lần gọi model và deadline 30 giây từ lúc xếp hàng. Giới hạn tài nguyên
vẫn có hiệu lực: 1024 span truy xuất, 64 nhóm compact khác nhau và request
24.000 byte; Ollama kiểm context thực tế với truncate=false. Các giới hạn này
không cam kết mọi lời kể hợp lệ ở API đều xử lý trong 30 giây.
Nhánh phrases phân biệt rỗng hợp lệ (`completed=True`) với thất bại (`False`).
Legacy trả list nên rỗng được đánh dấu `completed=None`,
`LEGACY_EMPTY_UNCLASSIFIED`: chưa biết là không triệu chứng hay lỗi/timeout.
Worker legacy giữ hành vi cũ; công cụ đo không được coi trạng thái chưa biết là
hoàn tất kỹ thuật. Hoàn tất kỹ thuật không chứng minh chọn đúng nghĩa/trạng thái.

## Settings và CLI (đã tích hợp trong #134)

- `AI_EXTRACTION_STRATEGY` nhận `phrases` hoặc `legacy`. Worker chọn theo
  settings. `AI_EXTRACTION_CANDIDATES_PER_PHRASE` nhận 1–50, mặc định 4.
- `LLM_PROVIDER=fake` hỗ trợ cả hai strategy để kiểm tích hợp. Fake chỉ dò tên
  triệu chứng trong phần văn bản tương ứng, nên dùng Gemma để đo chất lượng.
- `scripts.run_eval.run_extraction` gọi dispatcher, dùng chung snapshot/cache
  trong một lượt đo, lấy phiên bản prompt/strategy từ kết quả thực tế và lưu
  trạng thái hoàn tất/lý do lỗi riêng. Ca thất bại không được tính exact dù rỗng.
- Giữ công thức precision/recall, không bỏ ca thất bại khỏi mẫu số. Ghi model,
  strategy/K và snapshot cùng số đo. Đo trực tiếp không gồm hàng đợi/ghi worker,
  không gọi số đo đó là E2E.
- Dùng `--extraction-cases` với ca phát triển riêng; frozen chỉ chấm cuối.

Từ `server/`, chạy hai lần trên cùng bộ phát triển và snapshot:

```sh
python -m scripts.run_eval --extraction-only --extraction-cases <dev.jsonl> --extraction-strategy phrases --candidates-per-phrase 4 --out <phrases-dir>
python -m scripts.run_eval --extraction-only --extraction-cases <dev.jsonl> --extraction-strategy legacy --out <legacy-dir>
```

v0.2.4 chọn `phrases` làm mặc định sau khi đồng bộ settings và Compose. Đặt
`AI_EXTRACTION_STRATEGY=legacy` để chọn lại cách gửi toàn catalog.

## Luồng phrases và giới hạn

Che PII → tách span → truy xuất K ứng viên mỗi span từ KnowledgeReader Active →
giữ cặp phủ định phụ thuộc cùng nhóm đọc, hợp đủ ứng viên → một lần Gemma chọn
mã → kiểm schema/enum/mâu thuẫn/Active → HITL. Chuỗi từ ba vế giữ cách tách cũ.
Không thêm alias, không tự gán trạng thái bằng phép ghép nhóm.

Phrases dùng context mặc định của Ollama như reasoning (Compose hiện đặt 4096),
không ép 8192 trên từng request. Legacy vẫn gửi 8192. Giữ `truncate=false` và
`num_predict=768` cho phrases: quá context hoặc sinh chưa hoàn tất phải thành
lỗi, không nhận kết quả một phần. Giới hạn byte của request không bảo đảm vừa
context token; Ollama vẫn kiểm giới hạn thực tế.

Các ca phát triển và công cụ đo ở `tests/unit/ai/`. Lượt 36 ca ở giai đoạn ghép
phủ định đạt 32/36 exact, recall mã+trạng thái 95,59%, p95 10,94 s; còn sai không
dấu, thiếu mã cho cách nói thường, bỏ triệu chứng phủ định và mã thừa ở một ca
bình thường. Source cuối thêm giới hạn cặp: 10 ca phối hợp mới tăng 5/10 → 8/10,
precision/recall 85,71%, p95 8,69 s. Chưa đo lại đủ 36 ca bằng source cuối; unit
test xác nhận giới hạn cặp không đổi grouping của bộ 36. Đây là số đo phát triển,
chưa phải chấm frozen hoặc kiểm độ ổn định/load test.

Đo lại 10/11 bằng CLI #134 với cache chung, 46 ca phát triển và context mặc định
4096: 40/46 exact, precision/recall mã+trạng thái 93,26%, p95 10,00 s, max
18,21 s; 46/46 hoàn tất. Hai context 8192/4096 cho cùng kết quả trong phép so
riêng; probe đổi context cho thấy load thêm khoảng 5,7–6,7 s khi ép 8192.
Còn dev-r04/r20/r23/s05/c01/c09. Legacy 46/46 lỗi quá context trên cùng snapshot;
không coi độ trễ trả lỗi là hiệu năng suy luận. Đây vẫn là bộ phát triển,
queue wait=0, không thay thế nghiệm thu frozen/worker đầu-cuối.

Đợt sửa tiếp 10/11 đã thử bố cục chỉ ngữ cảnh từng câu, thứ tự trường status
trước mã và sinh bằng chứng trước mã. Các biến thể đều bị loại sau hồi quy;
selector vẫn dùng extraction-phrases-v2. Bộ 10 ca scope mới tại
`data/extraction_sentence_scope_dev_v1.jsonl` trong thư mục test AI cho baseline
7/10 exact, precision 84,21%, recall 88,89%; đây cũng là bộ phát triển.
`manual_selection_variant_probe.py` giúp tái hiện các biến thể bằng DB read-only,
không ghi prompt/bằng chứng thô. Thiếu alias “hụt hơi khi leo cầu thang” vẫn
cần Tuấn rà; không thêm bảng alias trong code để thay phần DB của Sprint 5.

Trước khi phát hành v0.2.4, chạy bộ kiểm thử server với DB `medassist_test`,
kiểm trích xuất qua app và đo một lần trên 29 ca đóng băng bằng Gemma trên
máy server. Đạt nghiệm thu khi cả 29 ca hoàn tất và p95 dưới 30 giây. Báo cáo
`summary.md` ghi cả precision và recall để đối chiếu chất lượng.
