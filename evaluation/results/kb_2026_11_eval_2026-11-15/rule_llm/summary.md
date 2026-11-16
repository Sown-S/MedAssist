# Kết quả đánh giá 2026-11-15 17:00

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

## Ca lâm sàng: Full (82 ca)

| Chỉ số | Giá trị |
|---|---|
| Red-flag recall (48 ca cờ đỏ) | 100.0% (mục tiêu ≥ 95%: đạt) |
| Ca cờ đỏ bị bỏ sót | không |
| Báo cờ đỏ nhầm | 0 |
| Mức ưu tiên đúng | 100.0% |
| Xếp thấp hơn nhãn (under-triage) | không |
| Luật khớp: P / R / F1 | 100.0% / 100.0% / 100.0% |
| Chẩn đoán phân biệt (18 ca): top-1 / top-3 | 88.9% / 94.4% |
| Chẩn đoán phân biệt: P / R / F1 (macro, top-3) | 50.0% / 89.8% / 62.0% |
| Độ trễ mean / p50 / p95 (ms) | 9187 / 2 / 36846 |

Ma trận mức ưu tiên (nhãn -> dự đoán): Emergency->Emergency: 48, HighPriority->HighPriority: 3, Routine->Routine: 31

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
| Độ trễ p50 / p95 / max (ms) | 8673 / 10906 / 11995 |
