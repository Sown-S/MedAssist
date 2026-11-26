# Kết quả đánh giá 2026-11-26 13:59

- testset: `testset-v1.5-frozen`
- testset_sha256: `34a6b896db336e3c2f753a968ba8331afa3ba3550d1787d17ca142b6be279085`
- knowledge_release: `KB-2026.12.3`
- llm_provider: `ollama`
- model: `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`
- reasoning_prompt: `reasoning-v3`
- server_version: `0.2.6`
- extraction_model: `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`
- extraction_strategy: `phrases`
- candidates_per_phrase: `4`
- extraction_prompt: `extraction-phrases-compact-v3, extraction-phrases-v2`
- interleave: `False`

## Ca lâm sàng: RuleOnly (85 ca)

| Chỉ số | Giá trị |
|---|---|
| Red-flag recall (48 ca cờ đỏ) | 100.0% (mục tiêu ≥ 95%: đạt) |
| Ca cờ đỏ bị bỏ sót | không |
| Báo cờ đỏ nhầm | 0 |
| Mức ưu tiên đúng | 100.0% |
| Xếp thấp hơn nhãn (under-triage) | không |
| Luật khớp: P / R / F1 | 100.0% / 100.0% / 100.0% |
| Chẩn đoán phân biệt (20 ca): top-1 / top-3 | 85.0% / 95.0% |
| Chẩn đoán phân biệt: P / R / F1 (macro, top-3) | 45.0% / 85.8% / 56.8% |
| Bệnh phải vắng trong ứng viên Node 2 (1 ca) | 1/1 đạt; lọt: không |
| Độ trễ mean / p50 / p95 (ms) | 5 / 0 / 11 |

Ma trận mức ưu tiên (nhãn -> dự đoán): Emergency->Emergency: 48, HighPriority->HighPriority: 3, Routine->Routine: 34

## Ca lâm sàng: Full (85 ca)

| Chỉ số | Giá trị |
|---|---|
| Red-flag recall (48 ca cờ đỏ) | 100.0% (mục tiêu ≥ 95%: đạt) |
| Ca cờ đỏ bị bỏ sót | không |
| Báo cờ đỏ nhầm | 0 |
| Mức ưu tiên đúng | 100.0% |
| Xếp thấp hơn nhãn (under-triage) | không |
| Luật khớp: P / R / F1 | 100.0% / 100.0% / 100.0% |
| Chẩn đoán phân biệt (20 ca): top-1 / top-3 | 90.0% / 95.0% |
| Chẩn đoán phân biệt: P / R / F1 (macro, top-3) | 45.0% / 85.8% / 56.8% |
| Bệnh phải vắng trong ứng viên Node 2 (1 ca) | 1/1 đạt; lọt: không |
| Độ trễ mean / p50 / p95 (ms) | 9551 / 1 / 34652 |

Ma trận mức ưu tiên (nhãn -> dự đoán): Emergency->Emergency: 48, HighPriority->HighPriority: 3, Routine->Routine: 34

## Trích xuất triệu chứng (29 ca)

Độ trễ đo trực tiếp từng ca, không có thời gian chờ hàng đợi (queue wait = 0); không phải số đo đầu-cuối.

| Chỉ số | Giá trị |
|---|---|
| Mã + trạng thái: P / R / F1 | 65.1% / 71.1% / 68.0% |
| Chỉ mã: P / R / F1 | 65.1% / 71.1% / 68.0% |
| Ca khớp hoàn toàn | 4/29 |
| Hoàn tất kỹ thuật | 29/29 |
| Thất bại (mã lý do) | không |
| Rỗng chưa phân loại (legacy) | không |
| Ca trả rỗng dù có triệu chứng | không |
| Ca vượt 30 s | không |
| Độ trễ p50 / p95 / max (ms) | 8112 / 11991 / 12063 |
