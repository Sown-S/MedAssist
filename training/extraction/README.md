# Fine-tune bước chọn cho trích xuất triệu chứng (`phrases`)

Thư mục này chứa pipeline sinh dữ liệu, kiểm định chống rò rỉ, ví dụ few-shot từ `dev`, cấu hình huấn luyện QLoRA trên Kaggle và `Modelfile` khớp với model gốc trong Ollama theo `fine-tune-trich-xuat.md` bản 3 (20/11/2026).

> **Nguyên tắc chống rò rỉ:** Các tệp trong `evaluation/` và `server/tests/unit/ai/data/` chỉ được đọc read-only ở bước `verify_dataset.py` để xác nhận **0 rò rỉ**, tuyệt đối không dùng để sinh hay tinh chỉnh dữ liệu huấn luyện. **Không huấn luyện chốt model trước khi Tuấn đóng băng `evaluation/testset_extraction_ft/` có SHA-256.** Trọng số `.gguf` và dữ liệu lớn `data/*.jsonl` được loại khỏi Git qua `.gitignore` cục bộ.

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

## 3. Huấn luyện trên Kaggle GPU 16 GB (sau khi Tuấn đóng băng `testset_extraction_ft`)

1. Nén/upload `training/extraction/data/{train,val,dev}.jsonl` và `training/extraction/config.json` lên Kaggle Dataset (ví dụ `medassist-extraction-ft`).
2. Import [train_kaggle_unsloth.ipynb](train_kaggle_unsloth.ipynb), bật **GPU T4 x2 / P100**, đính kèm dataset và **Run All**.
3. Tải file GGUF `Q4_K_M` về máy admin, đặt tên `medassist-extraction-q4_k_m.gguf` cạnh [Modelfile](Modelfile), đối chiếu **SHA-256** khớp với log Kaggle.

## 4. Nạp model fine-tune vào Ollama máy admin (không sửa `deploy/` ở repo chính)

```powershell
docker cp training/extraction/medassist-extraction-q4_k_m.gguf medassist-ollama-1:/tmp/medassist-extraction-q4_k_m.gguf
docker cp training/extraction/Modelfile medassist-ollama-1:/tmp/Modelfile
docker exec medassist-ollama-1 sh -c "cd /tmp && ollama create medassist-extraction:ft-v1 -f Modelfile && rm -f /tmp/medassist-extraction-q4_k_m.gguf /tmp/Modelfile"
```

Khi chạy đo nhánh C, cấu hình biến môi trường `OLLAMA_EXTRACTION_MODEL=medassist-extraction:ft-v1` (theo `deploy/README.md`).

## 5. Nhật ký artifact & SHA-256 file model (điền sau khi huấn luyện)

- **Link/vị trí lưu file GGUF:** *(chờ chạy Kaggle sau khi Tuấn chốt `testset_extraction_ft/`)*
- **Tên file GGUF:** *(chờ cập nhật)*
- **SHA-256 GGUF:** *(chờ cập nhật)*
- **Kaggle run log (`train_metrics.json`):** *(chờ cập nhật)*
