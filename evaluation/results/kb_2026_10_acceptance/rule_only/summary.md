# Kết quả đánh giá 2026-11-08 13:29

- testset: `testset-v1.3-frozen`
- testset_sha256: `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`
- knowledge_release: `KB-2026.10`
- llm_provider: `none`
- model: `None`
- server_version: `0.2.2`

## Ca lâm sàng: RuleOnly (82 ca)

| Chỉ số | Giá trị |
|---|---|
| Red-flag recall (48 ca cờ đỏ) | 100.0% (mục tiêu ≥ 95%: đạt) |
| Ca cờ đỏ bị bỏ sót | không |
| Báo cờ đỏ nhầm | 0 |
| Mức ưu tiên đúng | 100.0% |
| Xếp thấp hơn nhãn (under-triage) | không |
| Luật khớp: P / R / F1 | 100.0% / 100.0% / 100.0% |
| Chẩn đoán phân biệt (18 ca): top-1 / top-3 | 83.3% / 94.4% |
| Chẩn đoán phân biệt: P / R / F1 (macro, top-3) | 50.0% / 89.8% / 62.0% |
| Độ trễ mean / p50 / p95 (ms) | 8 / 0 / 20 |

Ma trận mức ưu tiên (nhãn -> dự đoán): Emergency->Emergency: 48, HighPriority->HighPriority: 3, Routine->Routine: 31
