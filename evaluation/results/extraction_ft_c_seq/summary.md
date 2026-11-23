# Kết quả đánh giá 2026-11-23 17:13

- testset: `testset-v1.4-frozen`
- testset_sha256: `a136d072e8c5149f25409591b245b61865e3320a5233ad73ef9d4d54aec86161`
- knowledge_release: `KB-2026.12.1`
- llm_provider: `ollama`
- model: `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`
- reasoning_prompt: `reasoning-v3`
- server_version: `0.2.5`
- extraction_model: `medassist-extraction:ft-v1`
- extraction_strategy: `phrases`
- candidates_per_phrase: `4`
- extraction_prompt: `extraction-phrases-compact-v3, extraction-phrases-v2`
- interleave: `False`
- extraction_cases: `symptom_extraction_testset_ft.jsonl`

## Trích xuất triệu chứng (30 ca)

Độ trễ đo trực tiếp từng ca, không có thời gian chờ hàng đợi (queue wait = 0); không phải số đo đầu-cuối.

| Chỉ số | Giá trị |
|---|---|
| Mã + trạng thái: P / R / F1 | 68.7% / 79.3% / 73.6% |
| Chỉ mã: P / R / F1 | 70.1% / 81.0% / 75.2% |
| Ca khớp hoàn toàn | 16/30 |
| Hoàn tất kỹ thuật | 29/30 |
| Thất bại (mã lý do) | EXT-FT-027: CONFLICTING_SELECTION |
| Rỗng chưa phân loại (legacy) | không |
| Ca trả rỗng dù có triệu chứng | EXT-FT-027 |
| Ca vượt 30 s | không |
| Độ trễ p50 / p95 / max (ms) | 7166 / 10794 / 11223 |
