# Kết quả đánh giá 2026-11-22 08:12

- testset: `testset-v1.3-frozen`
- testset_sha256: `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`
- knowledge_release: `KB-2026.12.1`
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
| Mã + trạng thái: P / R / F1 | 63.2% / 67.7% / 65.4% |
| Chỉ mã: P / R / F1 | 64.2% / 68.7% / 66.3% |
| Ca khớp hoàn toàn | 3/29 |
| Hoàn tất kỹ thuật | 29/29 |
| Thất bại (mã lý do) | không |
| Rỗng chưa phân loại (legacy) | không |
| Ca trả rỗng dù có triệu chứng | không |
| Ca vượt 30 s | không |
| Độ trễ p50 / p95 / max (ms) | 8512 / 12647 / 13138 |
