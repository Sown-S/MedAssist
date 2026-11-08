# Kết quả đánh giá 2026-11-07 22:28

- testset: `testset-v1.3-frozen`
- testset_sha256: `1d829d954930ba62c310944f2f34af9ac8ee0647bdf50c5042e0aeafe7b7ba0f`
- knowledge_release: `KB-2026.09`
- llm_provider: `fake`
- model: `fake`
- server_version: `0.2.2`

## Ca lâm sàng: RuleOnly (81 ca)

| Chỉ số | Giá trị |
|---|---|
| Red-flag recall (47 ca cờ đỏ) | 100.0% (mục tiêu ≥ 95%: đạt) |
| Ca cờ đỏ bị bỏ sót | không |
| Báo cờ đỏ nhầm | 0 |
| Mức ưu tiên đúng | 100.0% |
| Xếp thấp hơn nhãn (under-triage) | không |
| Luật khớp: P / R / F1 | 100.0% / 100.0% / 100.0% |
| Chẩn đoán phân biệt (18 ca): top-1 / top-3 | 77.8% / 94.4% |
| Chẩn đoán phân biệt: P / R / F1 (macro, top-3) | 50.0% / 89.8% / 62.0% |
| Độ trễ mean / p50 / p95 (ms) | 9 / 0 / 21 |

Ma trận mức ưu tiên (nhãn -> dự đoán): Emergency->Emergency: 47, HighPriority->HighPriority: 3, Routine->Routine: 31
