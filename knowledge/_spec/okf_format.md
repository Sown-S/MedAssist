---
schema: okf_spec_v1
label: KB-2026.01
description: Đặc tả định dạng OKF, quy ước mã slug, 8 khóa sinh hiệu và cấu trúc condition_logic
  của MedAssist.
---

# Đặc tả định dạng OKF: tri thức lâm sàng dạng Markdown của MedAssist

Kho tri thức soạn bằng Markdown (mở được bằng Obsidian), mỗi file có front matter YAML giữa hai dòng `---`.
Script `server/scripts/import_okf.py` đọc, kiểm tra toàn bộ thư mục rồi mới ghi vào CSDL; AI chỉ dùng dữ liệu trong CSDL.
Phụ trách nội dung: Tuấn. File này (schema `okf_spec_v1`) được script bỏ qua khi nạp.

## 1. Cấu trúc thư mục

| Đường dẫn | Schema | Bảng CSDL |
|---|---|---|
| `_release.md` | `okf_release_v1` | `knowledge_release` (một file duy nhất) |
| `sources/<source_key>.md` | `okf_source_v1` | `knowledge_source` |
| `symptoms/symptom_catalog.md` | `okf_symptom_catalog_v1` | `symptom_key`, `symptom` |
| `conditions/<disease_group>/<condition_code>.md` | `okf_condition_v1` | `condition`, `condition_symptom`, `guideline_excerpt` |
| `rules/red_flags/rf_*.md` | `okf_triage_rule_v1` | `triage_rule` (`RED_FLAG`, kết quả `Emergency`) |
| `rules/priority_floors/pf_*.md` | `okf_triage_rule_v1` | `triage_rule` (`PRIORITY_FLOOR`, kết quả `HighPriority`) |
| `_spec/` | `okf_spec_v1`, `okf_review_log_v1` | Không nạp |

Tên file bệnh và luật phải trùng `condition_code` / `rule_key`. Thư mục `exports/` (nếu có) bị bỏ qua.

## 2. Quy ước mã

- Mọi mã là **slug**: chữ thường không dấu, số, gạch dưới giữa các từ (`^[a-z0-9]+(_[a-z0-9]+)*$`), khớp CHECK trong CSDL.
- Độ dài tối đa: `symptom_code` 50, `condition_code` 80, `rule_key` và `excerpt_key` 80.
- `rule_key` có tiền tố theo loại: `rf_` cho `RED_FLAG`, `pf_` cho `PRIORITY_FLOOR`.
- Mã đã nạp thì không đổi: đổi tên là tạo mục mới và tắt mục cũ.
- Triệu chứng dùng cho luật cờ đỏ có tiền tố `sym_` (ví dụ `sym_respiratory_failure`); `out_of_scope_symptom` dành cho triệu chứng nguy hiểm ngoài danh mục.

## 3. Các loại file

### `_release.md`

```yaml
schema: okf_release_v1
label: KB-2026.01          # tối đa 30 ký tự; đổi mỗi lần nạp nội dung mới (KB-2026.02 ...)
description: ...
```

### `sources/*.md`

```yaml
schema: okf_source_v1
source_key: moh_qd_40_2015
title: Hướng dẫn chẩn đoán và điều trị các bệnh về mắt
organization: Bộ Y tế Việt Nam
edition: Quyết định số 40/QĐ-BYT
publication_date: '2015-01-12'    # tùy chọn
url: https://...                   # tùy chọn
accessed_date: '2026-10-30'        # tùy chọn
license_note: ...                  # tùy chọn
```

### `symptoms/symptom_catalog.md`

```yaml
schema: okf_symptom_catalog_v1
symptoms:
- symptom_code: fever_high
  symptom_name: Sốt cao (>= 38.5°C hoặc sốt cao đột ngột, liên tục)   # tối đa 150 ký tự, hiện trên màn Tiếp đón
  category: constitutional                                            # tùy chọn
```

### `conditions/<disease_group>/<condition_code>.md`

```yaml
schema: okf_condition_v1
condition_code: soi
name_vi: Sởi
icd10_code: B05                 # tùy chọn
disease_group: infectious       # trùng tên thư mục cha
description: ...                # tùy chọn
relations:
- symptom_code: koplik_spots
  polarity: SUPPORTS            # SUPPORTS hoặc CONTRADICTS
  weight: 0.98                  # 0–1, tối đa 2 chữ số thập phân
  is_key: true                  # triệu chứng chính: thiếu thông tin sẽ được nhắc hỏi thêm
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT   # tùy chọn, nếu có phải khớp edition của nguồn
excerpts:
- excerpt_key: soi_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Sởi
  source_key: moh_qd_1327_2014
  source_locator: Mục Chẩn đoán lâm sàng      # tối đa 100 ký tự, tùy chọn
```

Nội dung mỗi đoạn trích nằm trong thân file, dưới tiêu đề đúng mã:

```markdown
## excerpt: soi_chan_doan
- Giai đoạn khởi phát: ...
```

Mỗi `symptom_code` chỉ xuất hiện một lần trong `relations` của một bệnh và phải có trong danh mục triệu chứng.
`name_en` được phép ghi để đọc nhưng không nạp.

### `rules/**/*.md`

```yaml
schema: okf_triage_rule_v1
rule_key: rf_respiratory_failure
rule_name: 'Cờ đỏ: Suy hô hấp'
rule_type: RED_FLAG               # RED_FLAG -> Emergency, PRIORITY_FLOOR -> HighPriority
resulting_priority: Emergency
reason_text: 'CẤP CỨU: ...'       # hiện cho lễ tân và bác sĩ khi luật kích hoạt
source_key: moh_qd_1327_2014
condition_logic: { ... }          # mục 4
```

## 4. `condition_logic`

Cây điều kiện, lồng tối đa 5 tầng, đánh giá bằng logic ba trị (đúng / sai / chưa rõ):

| Nút | Dạng | Ghi chú |
|---|---|---|
| Nhóm | `{op: AND \| OR, args: [ ... ]}` | `args` không rỗng |
| Triệu chứng | `{type: symptom, symptom_code: ..., state: PRESENT \| ABSENT}` | Triệu chứng `UNKNOWN` cho kết quả "chưa rõ" |
| Sinh hiệu | `{type: vital, vital: <khóa>, cmp: <, <=, >, >=, ==, value: <số>}` | Thiếu số đo cho kết quả "chưa rõ" |
| Tuổi | `{type: age, unit: years \| months, cmp: ..., value: <số>}` | |

Luật cờ đỏ cho kết quả "chưa rõ" thì các mục còn thiếu được đưa vào danh sách **"Hỏi ngay"** cho lễ tân; chỉ kết quả "đúng" mới kích hoạt luật.

Ví dụ: suy hô hấp khi có triệu chứng **hoặc** SpO2 < 92 **hoặc** nhịp thở ≥ 30:

```yaml
condition_logic:
  op: OR
  args:
  - {type: symptom, symptom_code: sym_respiratory_failure, state: PRESENT}
  - {type: vital, vital: spo2_pct, cmp: '<', value: 92}
  - {type: vital, vital: respiratory_rate_bpm, cmp: '>=', value: 30}
```

**8 khóa sinh hiệu** (trùng `vital_signs` của lượt khám):

| Khóa | Đơn vị | Kiểu |
|---|---|---|
| `temperature_c` | °C | số thực |
| `heart_rate_bpm` | lần/phút | số nguyên |
| `respiratory_rate_bpm` | lần/phút | số nguyên |
| `systolic_bp_mmhg`, `diastolic_bp_mmhg` | mmHg | số nguyên |
| `spo2_pct` | % | số nguyên |
| `weight_kg` | kg | số thực |
| `height_cm` | cm | số thực |

## 5. Nạp vào CSDL

```powershell
cd server
python -m scripts.import_okf --dry-run                 # kiểm tra + xem thay đổi, không ghi
python -m scripts.import_okf --submit                  # tạo bản phát hành, gửi bác sĩ duyệt
python -m scripts.import_okf --approve-as <bác sĩ>     # tạo và kích hoạt ngay (bác sĩ khác người soạn)
```

- Có lỗi ở bất kỳ file nào thì script in danh sách và **không ghi gì**.
- Chỉ mục mới hoặc có nội dung khác mới tạo phiên bản mới; không có thay đổi thì báo "Không có thay đổi".
- Mục đã xóa khỏi thư mục vẫn Active cho tới khi chạy kèm `--retire-missing`.
- Sau khi kích hoạt, Admin vẫn tắt khẩn cấp được từng mục trên giao diện; tắt có hiệu lực ở lần đánh giá kế tiếp.
- Chi tiết tùy chọn: `server/README.md` mục 2.7b.
