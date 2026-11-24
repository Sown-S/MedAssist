# Kết quả đánh giá 2026-11-23 11:00

- testset: `/evaluation/testset`
- testset_sha256: ``
- knowledge_release: `KB-2026.12.1`
- llm_provider: `ollama`
- model: `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`
- reasoning_prompt: `reasoning-v3`
- server_version: `0.2.5`
- extraction_model: `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`
- extraction_strategy: `phrases`
- candidates_per_phrase: `4`
- extraction_prompt: `extraction-phrases-compact-v3, extraction-phrases-v2`
- extraction_few_shot: `{'file': 'few_shot_dev_examples.json', 'sha256': 'b2ab3624d6485af330e33a23eee270f91584fb9b2bcc65d44547b43a0b74746c', 'ids': ['dev-0002', 'dev-0037', 'dev-0008', 'dev-0004'], 'requests': {'with_examples': 29}}`
- extraction_cases: `ext29.jsonl`

## Trích xuất triệu chứng (29 ca)

Độ trễ đo trực tiếp từng ca, không có thời gian chờ hàng đợi (queue wait = 0); không phải số đo đầu-cuối.

| Chỉ số | Giá trị |
|---|---|
| Mã + trạng thái: P / R / F1 | 47.3% / 61.6% / 53.5% |
| Chỉ mã: P / R / F1 | 47.3% / 61.6% / 53.5% |
| Ca khớp hoàn toàn | 1/29 |
| Hoàn tất kỹ thuật | 27/29 |
| Thất bại (mã lý do) | EXT-010: CONFLICTING_SELECTION, EXT-018: EXTRACTION_TIMEOUT |
| Rỗng chưa phân loại (legacy) | không |
| Ca trả rỗng dù có triệu chứng | EXT-010, EXT-018 |
| Ca vượt 30 s | EXT-018 |
| Độ trễ p50 / p95 / max (ms) | 15153 / 22364 / 30030 |
