# Kết quả đánh giá 2026-11-23 11:04

- testset: `/evaluation/testset`
- testset_sha256: ``
- knowledge_release: `KB-2026.12.1`
- llm_provider: `ollama`
- model: `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`
- reasoning_prompt: `reasoning-v3`
- server_version: `0.2.5`
- extraction_model: `medassist-extraction:ft-v1`
- extraction_strategy: `phrases`
- candidates_per_phrase: `4`
- extraction_prompt: `extraction-phrases-compact-v3, extraction-phrases-v2`
- extraction_cases: `ext29.jsonl`

## Trích xuất triệu chứng (29 ca)

Độ trễ đo trực tiếp từng ca, không có thời gian chờ hàng đợi (queue wait = 0); không phải số đo đầu-cuối.

| Chỉ số | Giá trị |
|---|---|
| Mã + trạng thái: P / R / F1 | 57.3% / 63.6% / 60.3% |
| Chỉ mã: P / R / F1 | 58.2% / 64.6% / 61.2% |
| Ca khớp hoàn toàn | 2/29 |
| Hoàn tất kỹ thuật | 29/29 |
| Thất bại (mã lý do) | không |
| Rỗng chưa phân loại (legacy) | không |
| Ca trả rỗng dù có triệu chứng | không |
| Ca vượt 30 s | không |
| Độ trễ p50 / p95 / max (ms) | 7919 / 9810 / 11755 |
