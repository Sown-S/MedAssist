# Kết quả đánh giá 2026-11-16 08:58

- testset: `testset-v1.3-frozen`
- testset_sha256: `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`
- knowledge_release: `KB-2026.11`
- llm_provider: `ollama`
- model: `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`
- reasoning_prompt: `reasoning-v3`
- server_version: `0.2.5`
- extraction_model: `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`
- extraction_strategy: `phrases`
- candidates_per_phrase: `4`
- extraction_prompt: `extraction-phrases-compact-v3, extraction-phrases-v2`

## Trích xuất triệu chứng (29 ca)

Độ trễ đo trực tiếp từng ca, không có thời gian chờ hàng đợi (queue wait = 0); không phải số đo đầu-cuối.

| Chỉ số | Giá trị |
|---|---|
| Mã + trạng thái: P / R / F1 | 59.4% / 57.6% / 58.5% |
| Chỉ mã: P / R / F1 | 59.4% / 57.6% / 58.5% |
| Ca khớp hoàn toàn | 1/29 |
| Hoàn tất kỹ thuật | 26/29 |
| Thất bại (mã lý do) | EXT-008: UNMAPPED_PHRASE, EXT-010: UNMAPPED_PHRASE, EXT-028: UNMAPPED_PHRASE |
| Rỗng chưa phân loại (legacy) | không |
| Ca trả rỗng dù có triệu chứng | EXT-008, EXT-010, EXT-028 |
| Ca vượt 30 s | không |
| Độ trễ p50 / p95 / max (ms) | 8407 / 10490 / 11515 |
