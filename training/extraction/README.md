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

- **SHA-256 bộ test kín Tuấn đã đóng băng:** `d3cbdcfd22e2fe1846d6337abcd34d4f1b1a5d687c126da3cfea351281a200f4`
- **SHA-256 `few_shot_dev_examples.json`:** `b2ab3624d6485af330e33a23eee270f91584fb9b2bcc65d44547b43a0b74746c`
- **SHA-256 `Modelfile`:** `c5b792f9a3831286c98068cce9822a762e677ccc2b1b150a48c6b1134d494da3`
- **Phiên bản prompt chọn:** `extraction-phrases-v2`, `extraction-phrases-compact-v3`
- **Commit code dùng để đo:** bản khóa là chính commit cập nhật `training/extraction/` này (dựa trên commit cơ sở `cea2eeb`, trước khi nhận `evaluation/testset_extraction_ft/`)
- **Vị trí lưu file GGUF (`medassist-extraction-q4_k_m.gguf`):** máy admin `training/extraction/medassist-extraction-q4_k_m.gguf` (được loại khỏi Git qua `.gitignore`; đã nạp vào container `medassist-ollama-1` với tên `medassist-extraction:ft-v1`, ID `b1b184e0b10a`)
- **Dung lượng & SHA-256 file GGUF:** `5.761.057.504` bytes (`5,365 GiB`), `0f84301ddeff50c17efdff7b84bd5fe5fe360f031b7513f41a7e6caaddde8f7a` (khớp 100% [gguf_manifest.json](gguf_manifest.json), `SHA-256 = dbc2ac2f9965c8e38c71a9b145f4dd90acb74d5eaa502ed42ddd370e7fb0415c`)
- **SHA-256 LoRA adapter (`adapter_model.safetensors`):** `8ed5d52f533cd7ccfec77509c9bc473c45abc1ff84f89972197ef67987edaf67` (từ Kaggle `notebook5953e6d6b3`, `r=16`, `lora_alpha=16`, `epoch=2`)
- **Kaggle run log ([train_metrics.json](train_metrics.json), `SHA-256 = d86b875a05131fb1f6a0eb5e9b25af726bc2817a03306c3bd75e0a40ef1c0b7b`):** `epoch = 2.0`, `train_runtime = 24209,8968 s`, `train_loss = 0,011246`, `eval_loss = 0,002333`; `dev_sample_check` (`n=40`): `valid_json = 40/40`, `exact_json = 39/40` (`97,5%`).
- **Kiểm tra nạp Ollama (`medassist-extraction:ft-v1`, `KB-2026.12.1`, smoke test `6` ca từ `dev.jsonl` — `3` ca `v2` + `3` ca `compact-v3` qua `scripts.run_eval --extraction-only`, queue wait = 0):** `6/6` hoàn tất kỹ thuật, `6/6` khớp hoàn toàn (`P / R / F1 = 100,0% / 100,0% / 100,0%`), `0` thất bại, `0` ca vượt `30 s`, `p50 / p95 / max = 6685 / 9600 / 9600 ms`.
