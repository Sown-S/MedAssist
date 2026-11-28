# So sánh 3 nhánh A / B / C — Bộ test kín 30 ca (symptom_extraction_testset_ft.jsonl, SHA-256 d3cbdcfd22e2fe1846d6337abcd34d4f1b1a5d687c126da3cfea351281a200f4, verifier PASS)

- **Commit code dùng để đo:** `c7da1ef` (checkout `e8af1ce`, `git diff c7da1ef..HEAD -- server/app/` trống)
- **Verifier (`verify_extraction_ft.py`):** **`PASS`** (`is_frozen=true`, `count=30`, `SHA-256` chuẩn hóa LF = `d3cbdcfd22e2fe1846d6337abcd34d4f1b1a5d687c126da3cfea351281a200f4`; file CRLF trên đĩa Windows: `dbdb38555a8373eea1d30d38795955cad8d17b38fd9f9bf39c8075dea7f69d95`)
- **Trạng thái rà nhãn & giới hạn dữ liệu (`manifest_freeze.json`):** `review_status = SELF_REVIEWED` (`Tuấn xác nhận đã tự rà đủ 30 ca ngày 22/11/2026; chưa rà độc lập; nhãn do tác giả soạn`, `frozen_at = 2026-11-22T12:17:10.562004+07:00`). Bộ test chưa qua rà chéo độc lập; xem đây là giới hạn khi diễn giải kết quả tuyệt đối.
- **Chốt của nhóm (24/11/2026):** Sơn và Tuấn đã kiểm tra lại độc lập từ 6 tệp `results.json` (khớp P/R/F1, `exact`, recall `ABSENT`, `p95` và paired bootstrap 95% CI). Chốt vận hành thật **giữ Nhánh A** (cấu hình hiện tại, không đổi `.env` máy admin; đợt đánh giá chính thức `26–30/11` chạy với cấu hình hiện tại A). Nhánh B và C lưu làm kết quả thí nghiệm; Nhánh C ghi là hướng phát triển khi tách được bộ nhớ GPU.
- Kho tri thức kiểm định Top-4: `KB-2026.12.1` (`299` mã triệu chứng Active)
- Tập ca trích xuất: `evaluation\testset_extraction_ft\symptom_extraction_testset_ft.jsonl` (`30` ca)
- Bootstrap: `10000` lần, seed `20261123`
- Nhánh A (`_seq`): `evaluation\results\extraction_ft_a_seq\results.json` (`model=hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`, `SHA-256=acb2f25c59f8c39049c12fcf69200c43bef609e3ed1c39af24de0c506e976ea0`)
- Nhánh B (`_seq`): `evaluation\results\extraction_ft_b_seq\results.json` (`model=hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`, `SHA-256=388253a2564a64dbe10be841d2968ad153eef50386c401a5c26097b4e40df179`)
- Nhánh C (`_seq`): `evaluation\results\extraction_ft_c_seq\results.json` (`model=medassist-extraction:ft-v1`, `SHA-256=e0f0c2fe48b113847250edc3af9e67d5f0145fd03614b2bec1b32039807557b2`)
- Nhánh A (`--interleave`): `evaluation\results\extraction_ft_a_inter\results.json` (`SHA-256=e0b5070c45d8d9b9ef50d61e2aeedf7ffb6a1c91751387e259358d19958e7132`)
- Nhánh B (`--interleave`, `OLLAMA_NUM_CTX=8192` cho cả Node 3): `evaluation\results\extraction_ft_b_inter\results.json` (`SHA-256=2d411e70f2010b8b35ac5e9f613b937e7e47de524fcce8b898cc7931eea351d8`)
- Nhánh C (`--interleave`): `evaluation\results\extraction_ft_c_inter\results.json` (`SHA-256=c6296c32034b90ef6d7dcc639bf701f4d7e34ad54a0e61ec3cf0b9d061aceb4c`)
- *Lưu ý nguồn lâm sàng:* `--testset testset_v1.4` chỉ dùng làm ca lâm sàng Node 3 khi bật `--interleave` (nên `meta.testset` ghi `testset-v1.4-frozen`); toàn bộ chỉ số trích xuất chấm trên tập kín nêu trên.

## 1. Bảng chỉ số chính 3 nhánh (chạy liên tiếp `_seq`)

| Chỉ số | Nhánh A (Gốc) | Nhánh B (Gốc + few-shot) | Nhánh C (Fine-tune) |
|---|---:|---:|---:|
| Mã + trạng thái (P / R / F1) | 64.5% / 69.0% / **66.7%** | 64.3% / 77.6% / **70.3%** | 68.7% / 79.3% / **73.6%** |
| TP / FP / FN (mã + trạng thái) | 40 / 22 / 18 | 45 / 25 / 13 | 46 / 21 / 12 |
| Chỉ mã (P / R / F1) | 69.4% / 74.1% / 71.7% | 64.3% / 77.6% / 70.3% | 70.1% / 81.0% / 75.2% |
| Khớp hoàn toàn (`exact`) | 12/30 (40.0%) | 14/30 (46.7%) | 16/30 (53.3%) |
| Hoàn tất kỹ thuật | 29/30 | 29/30 | 29/30 |
| Thất bại (mã lý do) | `EXT-FT-014: CONFLICTING_SELECTION` | `EXT-FT-005: CONFLICTING_SELECTION` | `EXT-FT-027: CONFLICTING_SELECTION` |
| Ca vượt 30 s | 0 | 0 | 0 |
| Recall phủ định `ABSENT` (TP / tổng nhãn kỳ vọng) | 18/28 (64.3%) | 23/28 (82.1%) | 26/28 (92.9%) |
| Đảo cực `ABSENT↔PRESENT` | 2 / 0 | 0 / 0 | 1 / 0 |
| Mã bịa (ngoài catalog / ngoài Top-4) | 0 / 0 | 0 / 0 | 0 / 0 |
| Độ trễ liên tiếp p50 / p95 / max (ms) | 7239 / 12387 / 18061 | 11623 / 19545 / 20380 | 7166 / 10794 / 11223 |

- *Ghi chú hoàn tất kỹ thuật (`_seq` & `--interleave`):* Mỗi nhánh ở lượt chạy liên tiếp (`_seq`) có đúng **1 ca `CONFLICTING_SELECTION`** (`A: EXT-FT-014`, `B: EXT-FT-005`, `C: EXT-FT-027`) và **`0` ca quá `30 s`**; cả 6 lượt chạy (`_seq` và `--interleave`) đều có **`0` ca vượt `30 s`**.

## 2. Tách lỗi truy xuất (Top-4) và lỗi bước chọn

- Độ phủ truy xuất Top-4 trên bộ ca: `52/58` (**89.7%**).

| Phân rã FN | Nhánh A | Nhánh B | Nhánh C |
|---|---:|---:|---:|
| Tổng FN (mã + trạng thái) | 18 | 13 | 12 |
| Lỗi truy xuất (ngoài Top-4) | 6 | 6 | 6 |
| Lỗi bước chọn (đã có trong Top-4) | 12 (9 sót + 3 sai trạng thái) | 7 (7 sót + 0 sai trạng thái) | 6 (5 sót + 1 sai trạng thái) |
| Recall bước chọn khi đã lọt Top-4 | 76.9% | 86.5% | 88.5% |

## 3. Khoảng tin cậy paired bootstrap 95% CI (hiệu F1 mã + trạng thái, `_seq`)

- **C − B:** `+3.29` điểm % (95% CI: `[-3.70, +10.04]`) — chưa thấy khác biệt có ý nghĩa thống kê với 30 ca (CI chứa 0)
- **C − A:** `+6.93` điểm % (95% CI: `[-1.62, +15.59]`) — chưa thấy khác biệt có ý nghĩa thống kê với 30 ca (CI chứa 0)
- **B − A:** `+3.65` điểm % (95% CI: `[-5.34, +13.85]`) — chưa thấy khác biệt có ý nghĩa thống kê với 30 ca (CI chứa 0)

## 4. Chạy xen kẽ Trích xuất ↔ Node 3 (`--interleave`, chuẩn `run_eval`)

*Nhánh B dùng `OLLAMA_NUM_CTX=8192` cho cả Node 3 khi xen kẽ.*

| Chỉ số (`--interleave`) | Nhánh A (Gốc) | Nhánh B (Gốc + few-shot, 8192) | Nhánh C (Fine-tune) |
|---|---:|---:|---:|
| Mã + trạng thái (P / R / F1) | 64.1% / 70.7% / **67.2%** | 64.3% / 77.6% / **70.3%** | 69.7% / 79.3% / **74.2%** |
| Khớp hoàn toàn (`exact`) | 11/30 (36.7%) | 14/30 (46.7%) | 16/30 (53.3%) |
| Hoàn tất kỹ thuật / vượt 30 s | 30/30 / 0 | 29/30 / 0 | 29/30 / 0 |
| Thất bại (mã lý do) | không | `EXT-FT-005: CONFLICTING_SELECTION` | `EXT-FT-027: CONFLICTING_SELECTION` |
| Độ trễ xen kẽ p50 / p95 / max (ms) | 7274 / 11989 / 12572 | 11373 / 19084 / 21006 | 11538 / 15536 / 16987 |

- **Chênh lệch `p95` xen kẽ (C vs A):** `+29.6%` (`15536 ms` vs `11989 ms`, ngưỡng mục 6: `≤ +20.0%`).
- **Bootstrap 95% CI trên `--interleave` (`C − B`):** `+3.88` điểm % (95% CI: `[-2.76, +10.33]`) — chưa thấy khác biệt có ý nghĩa thống kê với 30 ca (CI chứa 0)
- **Bootstrap 95% CI trên `--interleave` (`C − A`):** `+6.98` điểm % (95% CI: `[-1.08, +14.86]`) — chưa thấy khác biệt có ý nghĩa thống kê với 30 ca (CI chứa 0)
- **Giới hạn phép đo xen kẽ:** `scripts.run_eval --interleave` **chỉ đo độ trễ của bước trích xuất**. Với Nhánh C, khi chạy xen kẽ trên GPU 6 GB dùng chung, hệ thống còn tốn thêm thời gian Ollama nạp lại model gốc cho bước **Node 3** (chưa được cộng trong bảng trên), nên khi chạy thật Nhánh C còn chậm hơn so với mức `p95 +29.6%` đã đo.

## 5. Tham khảo theo từng nửa `test-1` / `test-2` (`_seq`, kết luận chính vẫn tính trên 30 ca)

| Nửa | Nhánh A (F1 / exact) | Nhánh B (F1 / exact) | Nhánh C (F1 / exact) |
|---|---:|---:|---:|
| `test-1` (15 ca) | 63.5% / 5/15 | 67.7% / 7/15 | 67.7% / 7/15 |
| `test-2` (15 ca) | 70.2% / 7/15 | 72.7% / 7/15 | 79.4% / 9/15 |

## 6. Xét tiêu chí dùng thật (Mục 6 `fine-tune-trich-xuat.md` bản 3)

- F1 C (73.6%) ≥ F1 B (70.3%): **Đạt**
- Mã bịa C không tăng so với A: **Đạt**
- Độ trễ xen kẽ p95 C ≤ +20% so với A: **Chưa đạt**
- **Kết luận đề xuất theo đủ 3 tiêu chí mục 6:** **`GIỮ NHÁNH A HOẶC B`**
- **Chốt của nhóm (24/11/2026):** **`GIỮ NHÁNH A`** cho vận hành thật và đợt đánh giá chính thức `26–30/11` (giữ cấu hình hiện tại, không đổi `.env` máy admin). Nhánh B và C lưu làm kết quả thí nghiệm; Nhánh C là hướng phát triển khi tách được bộ nhớ GPU.
- *Lưu ý cụm `unmapped`:* chưa có trường `unmapped_phrases` trong `results.json` của `run_eval`.

## 7. Phân tích kết quả & các nhóm lỗi (số tổng hợp bộ kín, ví dụ từ tập `dev`)

### 7.1. Diễn giải quyết định Mục 6
1. **Về chất lượng trích xuất:** Nhánh C (`medassist-extraction:ft-v1`) dẫn đầu mọi chỉ số chính: F1 `73.6%` (`_seq`) / `74.2%` (`--interleave`) so với Nhánh B (`70.3%`) và Nhánh A (`66.7%` / `67.2%`); tỷ lệ ca đúng hoàn toàn (`exact`) đạt **`16/30` (`53.3%`)** (so với `14/30` ở B và `12/30` ở A); **recall `ABSENT`** đạt **`26/28` (`92.9%`)** (so với `23/28 = 82.1%` ở B và `18/28 = 64.3%` ở A); **0 mã bịa**; khi chạy riêng trích xuất (`_seq`) là nhánh nhanh nhất (`p50/p95 = 7166 / 10794 ms`). Lưu ý rằng tập test kín 30 ca đang ở trạng thái `SELF_REVIEWED` (do tác giả tự rà đủ 30 ca, chưa rà độc lập).
2. **Về ý nghĩa thống kê (`n = 30` ca):** Khoảng tin cậy paired bootstrap 95% CI cho hiệu `F1(C − B)` là `[-3.70, +10.04]` (`_seq`) / `[-2.76, +10.33]` (`--interleave`) và `F1(C − A)` là `[-1.62, +15.59]` (`_seq`) / `[-1.08, +14.86]` (`--interleave`) — đều chứa `0`, chưa đủ kết luận khác biệt có ý nghĩa thống kê ở cỡ mẫu 30 ca (đúng như dự kiến trong `fine-tune-trich-xuat.md` bản 3).
3. **Điểm chặn kỹ thuật trên GPU 6 GB (`--interleave`):** Khi xen kẽ mỗi ca trích xuất với một ca Node 3 dùng model gốc, `p95` riêng bước trích xuất của Nhánh C tăng từ `11989 ms` (Nhánh A) lên `15536 ms` (**`+29.6%`**, vượt ngưỡng `≤ +20%`) vì Ollama phải giải phóng model gốc để nạp `medassist-extraction:ft-v1` vào VRAM 6 GB. Do `run_eval --interleave` chỉ đo bước trích xuất, độ trễ nạp lại model gốc ở bước **Node 3** chưa nằm trong con số `+29.6%`, tức độ trễ đầu-cuối khi chạy thật của Nhánh C còn cao hơn nữa. (Nhánh B đặt `OLLAMA_NUM_CTX=8192` áp dụng cho cả Node 3 khi xen kẽ nên `p95` trích xuất lên `19084 ms`, `+59.2%` so với A.) Vì vậy nhóm chốt **giữ Nhánh A** khi chạy thật và trong đợt đánh giá `26–30/11`, ghi nhận Nhánh C làm hướng phát triển khi tách được bộ nhớ GPU.

### 7.2. Phân loại 4 nhóm lỗi điển hình (số tổng hợp bộ kín; ví dụ đề xuất sửa lấy từ tập `dev`)
- **Nhóm 1 — Lỗi truy xuất ngoài Top-4 (bước chọn không thể tự sửa):**
  - *Ví dụ lấy từ `dev` (`focus_dev_2026-11-22_after_aliases`):* `fdev-03` (`dizziness_vertigo` xếp hạng #5 ngoài Top-4).
  - *Số tổng hợp trên tập kín 30 ca:* `6/58` (`10.3%`) nhãn kỳ vọng không nằm trong Top-4 (giống nhau ở cả 3 nhánh), chiếm `6/12` (`50.0%`) tổng FN của Nhánh C.
  - *Nguyên tắc bảo toàn tập kín:* Bổ sung `aliases` cho 6 lỗi truy xuất chỉ được làm dựa trên bộ `dev` (hoặc kho ví dụ ngoài tập kín); **nếu sửa theo chính 6 ca của bộ kín thì bộ 30 ca này không còn là tập kín nữa**.
- **Nhóm 2 — Bỏ sót hoặc nhầm trạng thái phủ định (`ABSENT`) / chưa rõ (`UNKNOWN`):**
  - *Ví dụ trên `dev` (`focus_dev_2026-11-22_after_aliases`, model gốc):* `fdev-01` (`fever_high: ABSENT`), `fdev-02` (`nausea_vomiting_diarrhea: ABSENT`), `fdev-10` (`headache_dull: ABSENT`, `fever_high: ABSENT`), `fdev-29` (`cough_dry: UNKNOWN`).
  - *Số tổng hợp trên tập kín:* Recall `ABSENT` tăng từ `18/28` (`64.3%`) ở A → `23/28` (`82.1%`) ở B → **`26/28` (`92.9%`)** ở C.
- **Nhóm 3 — Chọn dư hoặc nhầm sang mã lân cận (`FP` khi có nhiều ứng viên gần nghĩa):**
  - *Ví dụ trên `dev`:* `fdev-07` (nhầm `vocal_abuse_phonotrauma_strain` sang `voice_pitch_timbre_alteration`), `fdev-18` (chọn dư `10` mã), `fdev-20` (chọn dư `avascular_femoral_head_necrosis_groin_pain` và `lumbar_spondylosis_paraspinal_spasm`).
  - *Số tổng hợp trên tập kín:* Nhánh B bị suy giảm Precision (`64.3%`, `FP = 25`) do vài ví dụ few-shot làm model gốc chọn rộng hơn; Nhánh C giữ được Precision cao nhất (`68.7%` ở `_seq` / `69.7%` ở `--interleave`, `FP = 21` ở `_seq`).
- **Nhóm 4 — Xung đột cùng mã giữa nhiều cụm (`CONFLICTING_SELECTION`):**
  - Khi một lời kể tách thành nhiều cụm có cùng ứng viên và LLM chọn một mã ở hai trạng thái mâu thuẫn (`PRESENT` và `ABSENT`), hàm `validate_selection` từ chối toàn bộ ca thay vì gộp mâu thuẫn. Ở lượt `_seq`, mỗi nhánh gặp `1/30` ca lỗi này (`A: 1`, `B: 1`, `C: 1`); ở `--interleave`, số ca lỗi lần lượt là `A: 0/30`, `B: 1/30`, `C: 1/30`; cả 6 lượt đều `0` ca quá `30 s`.

## 8. Kết quả 29 ca đóng băng `v1.3` (THAM KHẢO — không phải tập kín)

Theo Mục 4 `fine-tune-trich-xuat.md` bản 3, bảng 3 nhánh A / B / C trên `29` ca đóng băng `v1.3` (`testset-v1.3-frozen`, `KB-2026.12.1`, chạy liên tiếp `_seq`) được lưu làm số liệu tham khảo tại [`../ext29_ref_comparison/README.md`](../ext29_ref_comparison/README.md) (không dùng để xét tiêu chí thay cho bộ kín 30 ca):

| Nhánh (`29` ca `v1.3` tham khảo) | P / R / F1 (mã + trạng thái) | Exact | Hoàn tất / vượt `30 s` | Recall `ABSENT` | p50 / p95 / max (ms) |
|---|---:|---:|---:|---:|---:|
| Nhánh A (Gốc) | 63.2% / 67.7% / **65.4%** | 3/29 (10.3%) | 29/29 / 0 | 2/12 (16.7%) | 8512 / 12647 / 13138 |
| Nhánh B (Gốc + few-shot, `num_ctx=8192`) | 47.3% / 61.6% / **53.5%** | 1/29 (3.4%) | 27/29 / 1 | 2/12 (16.7%) | 15153 / 22364 / 30030 |
| Nhánh C (Fine-tune `ft-v1`) | 57.3% / 63.6% / **60.3%** | 2/29 (6.9%) | 29/29 / 0 | 1/12 (8.3%) | 7919 / 9810 / 11755 |

Trên 29 ca `v1.3` đa chuyên khoa ngoài 38 bệnh trọng tâm của tập huấn luyện, Nhánh A vượt cả Nhánh C (`−5.08` điểm %, 95% CI `[-11.27, +1.03]`) và vượt có ý nghĩa Nhánh B (`B − A = −11.86` điểm %, 95% CI `[-18.94, -4.83]`), tiếp tục củng cố quyết định **giữ Nhánh A** khi vận hành thực tế trên toàn catalog.
