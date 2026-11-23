# Fine-tune bước chọn cho trích xuất triệu chứng (`phrases`)

Thư mục này chứa pipeline sinh dữ liệu, kiểm định chống rò rỉ, ví dụ few-shot từ `dev`, cấu hình huấn luyện QLoRA trên Kaggle và `Modelfile` khớp với model gốc trong Ollama theo `fine-tune-trich-xuat.md` bản 3 (20/11/2026).

> **Nguyên tắc chống rò rỉ:** Các tệp trong `evaluation/` và `server/tests/unit/ai/data/` chỉ được đọc read-only ở bước `verify_dataset.py` để xác nhận **0 rò rỉ**, tuyệt đối không dùng để sinh hay tinh chỉnh dữ liệu huấn luyện. Trọng số `.gguf` và dữ liệu lớn `data/*.jsonl` được loại khỏi Git qua `.gitignore` cục bộ.

## 1. Cấu trúc tệp

| Tệp | Vai trò |
|---|---|
| [config.json](config.json) | Seed, số lượng split (`2000/200/200`), tỉ lệ `v2`/`compact-v3` (`30%/70%`) và siêu tham số QLoRA |
| [generate_dataset.py](generate_dataset.py) | Sinh `train/val/dev.jsonl` bằng chính code server (`retrieve_phrases` → `group_for_selection` → `selection_request` / `compact_selection.selection_request`) trên `KB-2026.12.1` |
| [verify_dataset.py](verify_dataset.py) | Kiểm khớp 100% prompt, `validate_selection`, SHA-256, 0 trùng lặp giữa splits và 0 rò rỉ bộ test |
| [few_shot_dev_examples.json](few_shot_dev_examples.json) | 4 ví dụ đại diện rút riêng từ `dev.jsonl` gửi Sơn cho nhánh B (`<= 24/11`) |
| [train_kaggle_unsloth.ipynb](train_kaggle_unsloth.ipynb) | Notebook QLoRA Unsloth chạy Kaggle GPU 16 GB (đã xóa output), xuất GGUF `Q4_K_M` |
| [Modelfile](Modelfile) | Template chat Gemma/SEA-LION khớp nguyên văn model gốc trong Ollama |
| [test_generate_dataset.py](test_generate_dataset.py) | Unit test nhanh pipeline sinh & kiểm định dữ liệu |

## 2. Sinh và kiểm định dữ liệu trên máy local

```powershell
# Từ thư mục gốc MedAssist
.\venv\Scripts\python.exe training/extraction/generate_dataset.py
.\venv\Scripts\python.exe training/extraction/verify_dataset.py
.\venv\Scripts\python.exe -m pytest --noconftest training/extraction/test_generate_dataset.py -q
```

## 3. Huấn luyện trên Kaggle GPU 16 GB (sau khi Tuấn đóng băng bộ kín)

1. Upload gói `medassist-extraction-ft-data.zip` (gồm `train.jsonl`, `val.jsonl`, `dev.jsonl`, `config.json`, `dataset_manifest.json`) thành Kaggle Dataset (ví dụ `medassist-extraction-ft`).
2. Import [train_kaggle_unsloth.ipynb](train_kaggle_unsloth.ipynb), bật **GPU T4 x2** hoặc **P100** (notebook tự ghim `CUDA_VISIBLE_DEVICES=0` và xử lý file tạm ở `/tmp/medassist_work/` để không tràn quota 20 GB của `/kaggle/working/`), đính kèm dataset và **Run All**.
3. Tải `medassist-extraction-q4_k_m.gguf`, `gguf_manifest.json` và `train_metrics.json` về máy admin, đặt file `.gguf` cạnh [Modelfile](Modelfile), đối chiếu **SHA-256** khớp với `gguf_manifest.json`.

## 4. Nạp model fine-tune & lưu ý khi chạy 3 nhánh A / B / C

```powershell
docker cp training/extraction/medassist-extraction-q4_k_m.gguf medassist-ollama-1:/tmp/medassist-extraction-q4_k_m.gguf
docker cp training/extraction/Modelfile medassist-ollama-1:/tmp/Modelfile
docker exec medassist-ollama-1 sh -c "cd /tmp && ollama create medassist-extraction:ft-v1 -f Modelfile && rm -f /tmp/medassist-extraction-q4_k_m.gguf /tmp/Modelfile"
```

- **Nhánh A (model gốc):** cấu hình mặc định (`OLLAMA_EXTRACTION_MODEL` trống, `OLLAMA_NUM_CTX=0`).
- **Nhánh B (model gốc + few-shot từ dev):** chạy `scripts.run_eval` với `--extraction-few-shot training/extraction/few_shot_dev_examples.json` và **đặt `OLLAMA_NUM_CTX=8192`** (vì prompt `compact` kèm ví dụ dài thêm khoảng `6.500` ký tự, để mặc định `4096` có thể vượt context và báo lỗi).
- **Nhánh C (model fine-tune):** đặt `OLLAMA_EXTRACTION_MODEL=medassist-extraction:ft-v1` (theo `deploy/README.md`), giữ prompt hiện tại; nhớ đo thêm độ trễ khi chạy xen kẽ trích xuất và đánh giá Node 3.

## 5. Bản khóa thí nghiệm & nhật ký artifact (trước khi nhận bộ test kín)

- **Commit code dùng để đo:** `a3823c9` (tích hợp `#179`–`#181`; sẽ đồng bộ thêm PR tùy chọn đo xen kẽ cho `run_eval` của Sơn trước khi chạy chính thức 3 nhánh trên bộ kín)
- **SHA-256 bộ test kín Tuấn đã đóng băng:** `d3cbdcfd22e2fe1846d6337abcd34d4f1b1a5d687c126da3cfea351281a200f4`
- **SHA-256 `few_shot_dev_examples.json`:** `b2ab3624d6485af330e33a23eee270f91584fb9b2bcc65d44547b43a0b74746c`
- **SHA-256 `Modelfile`:** `c5b792f9a3831286c98068cce9822a762e677ccc2b1b150a48c6b1134d494da3`
- **Phiên bản prompt chọn:** `extraction-phrases-v2`, `extraction-phrases-compact-v3`
- **File GGUF (`medassist-extraction-q4_k_m.gguf`):**
  - Dung lượng & SHA-256: `5.761.057.504` bytes (`5,365 GiB`), `0f84301ddeff50c17efdff7b84bd5fe5fe360f031b7513f41a7e6caaddde8f7a` (khớp 100% [gguf_manifest.json](gguf_manifest.json), `SHA-256 = dbc2ac2f9965c8e38c71a9b145f4dd90acb74d5eaa502ed42ddd370e7fb0415c`)
  - Link lưu file GGUF (Kaggle Output / Drive): `https://www.kaggle.com/code/huyvdng/notebook28af65fda5/output` (bản cục bộ trên máy admin tại `training/extraction/medassist-extraction-q4_k_m.gguf`, gitignored)
  - LoRA adapter nguồn (`adapter_model.safetensors`, `SHA-256 = 8ed5d52f533cd7ccfec77509c9bc473c45abc1ff84f89972197ef67987edaf67`): `https://www.kaggle.com/code/huyvdng/notebook5953e6d6b3/output` (`r=16`, `lora_alpha=16`, `epoch=2`)
- **Digest trong Ollama (`ollama list` & `/api/tags` trên container `medassist-ollama-1`):**
  - Model fine-tune `medassist-extraction:ft-v1`: ID `b1b184e0b10a`, digest đầy đủ `b1b184e0b10aaac149cce0dccaae49ea0848a296252d23c715de736d2536997e` (`5.761.058.044` bytes / `5.8 GB`)
  - Model gốc `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`: ID `6a9ca7d6bead`, digest đầy đủ `6a9ca7d6bead2f65f13cd3b098b7c15230bcdd25c8b8a60be1b86dbd63da88c3` (`5.761.060.089` bytes / `5.8 GB`)
- **Kaggle run log ([train_metrics.json](train_metrics.json), `SHA-256 = d86b875a05131fb1f6a0eb5e9b25af726bc2817a03306c3bd75e0a40ef1c0b7b`):** `epoch = 2.0`, `train_runtime = 24209,8968 s`, `train_loss = 0,011246`, `eval_loss = 0,002333`; `dev_sample_check` (`n=40`): `valid_json = 40/40`, `exact_json = 39/40` (`97,5%`). *(Ghi chú: `eval_loss` rất thấp do dữ liệu tổng hợp theo mẫu; chỉ kết luận hiệu năng trên bộ test kín ~30 ca.)*
- **Cấu hình đo cho cả 3 nhánh A / B / C:**
  - Kho tri thức Active: `KB-2026.12.1` (`knowledge/symptoms/symptom_catalog.md` `SHA-256 = a5187d3c07c33a51315a22b3883c0eaad40f6e2079ba881e0b64a7e89d9a3970`; `CandidateIndex` `lexical-phrases-v2` `catalogue_sha256 = aab3a2d992a58c003f713c90bf8175f530a8d6c147f7251d08a6b404377576a0`)
  - Chiến lược: `phrases`, `K = 4` (`AI_EXTRACTION_CANDIDATES_PER_PHRASE=4`), ngân sách `30 s` (`EXTRACTION_TIMEOUT_SECONDS=30`)
  - Context: Nhánh A & C dùng `OLLAMA_NUM_CTX=0` (mặc định máy chủ `4096`); Nhánh B dùng `OLLAMA_NUM_CTX=8192`
  - Kiểm tra nạp Ollama (smoke test `6` ca từ `dev.jsonl` — `3` `v2` + `3` `compact-v3` qua `scripts.run_eval --extraction-only`, queue wait = 0): `6/6` hoàn tất, `6/6` khớp hoàn toàn (`p50 / p95 / max = 6685 / 9600 / 9600 ms`).
- **Ba lệnh `scripts.run_eval` cho 3 nhánh (chạy từ `server/`, hoặc chạy tương đương trong container `medassist-api-1` với cùng biến môi trường; nhánh C sẽ gắn thêm tùy chọn đo xen kẽ sau khi PR của Sơn merge):**

```powershell
# Nhánh A — model gốc
$env:OLLAMA_EXTRACTION_MODEL=""; $env:OLLAMA_NUM_CTX="0"; python -m scripts.run_eval --extraction-only --testset ..\evaluation\testset_extraction_ft --extraction-strategy phrases --candidates-per-phrase 4 --out ..\evaluation\results\extraction_ft_branch_a

# Nhánh B — model gốc + few-shot từ dev
$env:OLLAMA_EXTRACTION_MODEL=""; $env:OLLAMA_NUM_CTX="8192"; python -m scripts.run_eval --extraction-only --testset ..\evaluation\testset_extraction_ft --extraction-strategy phrases --candidates-per-phrase 4 --extraction-few-shot ..\training\extraction\few_shot_dev_examples.json --out ..\evaluation\results\extraction_ft_branch_b

# Nhánh C — model fine-tune (chờ gắn thêm tùy chọn đo xen kẽ từ PR của Sơn trước khi chạy chính thức)
$env:OLLAMA_EXTRACTION_MODEL="medassist-extraction:ft-v1"; $env:OLLAMA_NUM_CTX="0"; python -m scripts.run_eval --extraction-only --testset ..\evaluation\testset_extraction_ft --extraction-strategy phrases --candidates-per-phrase 4 --out ..\evaluation\results\extraction_ft_branch_c
```
