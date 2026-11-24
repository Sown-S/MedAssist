# So sánh 3 nhánh A / B / C — 29 ca đóng băng v1.3 (THAM KHẢO — không phải tập kín)

> **CẢNH BÁO — THAM KHẢO THEO MỤC 4 `fine-tune-trich-xuat.md` BẢN 3, KHÔNG PHẢI TẬP TEST KÍN:** Tập 29 ca `v1.3` (`testset-v1.3-frozen`) đã dùng nhiều lần trong quá trình phát triển nên không phải tập test kín. Mọi tiêu chí xét duyệt dùng thật ở Mục 6 chỉ đánh giá trên bộ test kín 30 ca ([`../extraction_ft_comparison/README.md`](../extraction_ft_comparison/README.md)), nơi nhóm đã chốt **giữ Nhánh A**.

- Kho tri thức kiểm định Top-4: `KB-2026.12.1` (`299` mã triệu chứng Active)
- Bộ dữ liệu đóng băng: `testset-v1.3-frozen` (`combined_sha256 = 4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`)
- Tập ca trích xuất: `evaluation\testset\symptom_extraction_testset.jsonl` (`29` ca, `SHA-256` chuẩn hóa LF = `92e62bf63fa63a78f9595c41b8a4fdb26ca8c4517006e828031a19b390949b34`; file CRLF trên đĩa Windows = `c25e5b9b64604d890c348955b177a360b1fc03351c9d782cce64da5fbd9c56a0`)
- Bootstrap: `10000` lần, seed `20261123`
- Nhánh A (`_seq`, `num_ctx=0`): `evaluation\results\ext29_2026-11-22_after_aliases\results.json` (`model=hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`, `SHA-256=a8e477a0687b36d5ab63c9f6cac9eb5dc7e8940e9938ca8fb47ccc312b9b77a5`)
- Nhánh B (`_seq`, `OLLAMA_NUM_CTX=8192`): `evaluation\results\ext29_ref_b_seq\results.json` (`model=hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`, `SHA-256=d60a765d1185aa1acc271f714b8b2c8548d06248f4dfaee4ae31ed673801950b`)
- Nhánh C (`_seq`, `num_ctx=0`): `evaluation\results\ext29_ref_c_seq\results.json` (`model=medassist-extraction:ft-v1`, `SHA-256=eb7455b2c97d36ce85a17e4773b1b324e1761eb6dcedd48a7137d866c56a009d`)

## 1. Bảng chỉ số chính 3 nhánh (chạy liên tiếp `_seq`)

| Chỉ số | Nhánh A (Gốc) | Nhánh B (Gốc + few-shot, `num_ctx=8192`) | Nhánh C (Fine-tune) |
|---|---:|---:|---:|
| Mã + trạng thái (P / R / F1) | 63.2% / 67.7% / **65.4%** | 47.3% / 61.6% / **53.5%** | 57.3% / 63.6% / **60.3%** |
| TP / FP / FN (mã + trạng thái) | 67 / 39 / 32 | 61 / 68 / 38 | 63 / 47 / 36 |
| Chỉ mã (P / R / F1) | 64.2% / 68.7% / 66.3% | 47.3% / 61.6% / 53.5% | 58.2% / 64.6% / 61.2% |
| Khớp hoàn toàn (`exact`) | 3/29 (10.3%) | 1/29 (3.4%) | 2/29 (6.9%) |
| Hoàn tất kỹ thuật | 29/29 | 27/29 | 29/29 |
| Thất bại (mã lý do) | không | `EXT-010: CONFLICTING_SELECTION`, `EXT-018: EXTRACTION_TIMEOUT` (`30030 ms`) | không |
| Ca vượt 30 s | 0 | 1 (`EXT-018`) | 0 |
| Recall phủ định `ABSENT` (TP / tổng nhãn kỳ vọng) | 2/12 (16.7%) | 2/12 (16.7%) | 1/12 (8.3%) |
| Đảo cực `ABSENT↔PRESENT` | 1 / 0 | 0 / 0 | 1 / 0 |
| Mã bịa (ngoài catalog / ngoài Top-4) | 0 / 0 | 0 / 0 | 0 / 0 |
| Độ trễ liên tiếp p50 / p95 / max (ms) | 8512 / 12647 / 13138 | 15153 / 22364 / 30030 | 7919 / 9810 / 11755 |

## 2. Tách lỗi truy xuất (Top-4) và lỗi bước chọn

- Độ phủ truy xuất Top-4 trên bộ ca: `82/99` (**82.8%**).

| Phân rã FN | Nhánh A | Nhánh B | Nhánh C |
|---|---:|---:|---:|
| Tổng FN (mã + trạng thái) | 32 | 38 | 36 |
| Lỗi truy xuất (ngoài Top-4) | 17 | 17 | 17 |
| Lỗi bước chọn (đã có trong Top-4) | 15 (14 sót + 1 sai trạng thái) | 21 (21 sót + 0 sai trạng thái) | 19 (18 sót + 1 sai trạng thái) |
| Recall bước chọn khi đã lọt Top-4 | 81.7% | 74.4% | 76.8% |

## 3. Khoảng tin cậy paired bootstrap 95% CI (hiệu F1 mã + trạng thái, `_seq`)

- **C − B:** `+6.78` điểm % (95% CI: `[-0.55, +13.87]`) — chưa thấy khác biệt có ý nghĩa thống kê với 29 ca (CI chứa 0)
- **C − A:** `-5.08` điểm % (95% CI: `[-11.27, +1.03]`) — chưa thấy khác biệt có ý nghĩa thống kê với 29 ca (CI chứa 0)
- **B − A:** `-11.86` điểm % (95% CI: `[-18.94, -4.83]`) — kém hơn có ý nghĩa thống kê (CI < 0)

## 4. Nhận xét tham khảo — không dùng để xét tiêu chí Mục 6

- **Phạm vi đo:** Trên bộ 29 ca đóng băng `v1.3` chỉ chạy chế độ liên tiếp (`_seq`), không chạy `--interleave`, và **không** dùng bộ này để xét điều kiện bật model fine-tune theo Mục 6. Mọi tiêu chí dùng thật được xét trên bộ kín 30 ca ([`../extraction_ft_comparison/README.md`](../extraction_ft_comparison/README.md)), nơi nhóm đã chốt **giữ Nhánh A**.
- **Hoàn tất kỹ thuật:** Nhánh A và C cùng đạt `29/29` hoàn tất (`0` ca vượt `30 s`), riêng Nhánh B (`OLLAMA_NUM_CTX=8192`) đạt `27/29` do `EXT-010` lỗi `CONFLICTING_SELECTION` và `EXT-018` quá hạn `EXTRACTION_TIMEOUT` (`30030 ms`).
- **Tổng quát hóa ngoài 38 bệnh trọng tâm:** Vì bộ 29 ca `v1.3` trải rộng nhiều chuyên khoa ngoài 38 bệnh trọng tâm dùng để sinh dữ liệu fine-tune và rút ví dụ few-shot `dev`, model gốc ở Nhánh A (`F1 65.4%`) đạt cao hơn Nhánh C (`60.3%`, chênh `C − A = −5.08` điểm %, 95% CI `[-11.27, +1.03]`) và vượt có ý nghĩa Nhánh B (`53.5%`, chênh `B − A = −11.86` điểm %, 95% CI `[-18.94, -4.83]`). Kết quả tham khảo này tiếp tục củng cố quyết định **giữ Nhánh A** khi vận hành thực tế trên toàn bộ catalog.
- *Lưu ý cụm `unmapped`:* chưa có trường `unmapped_phrases` trong `results.json` của `run_eval`.
