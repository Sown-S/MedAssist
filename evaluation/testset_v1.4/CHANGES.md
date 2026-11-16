# Đề xuất thay đổi v1.4 và tự đánh giá

Bản riêng, chưa đóng băng; rà chéo PENDING_CROSS_REVIEW. Chỉ dựa vào phản hồi Huy, dữ kiện ca và nguồn đã có. Không chạy pipeline hoặc sử dụng chỉ số/thứ hạng từ kết quả đánh giá để chọn nhãn.

## Nguồn đã đọc

- [README rà chéo](../review/README_review.md) và hai phiếu [lâm sàng](../review/review_sheet_clinical_v1.3.csv), [trích xuất](../review/review_sheet_extraction_v1.3.csv): đọc đủ 82 và 29 dòng; 5 nhận xét CẦN SỬA được lưu nguyên văn trong manifest và dưới đây.
- [Catalog](../../knowledge/symptoms/symptom_catalog.md), [trích dẫn ghẻ](../../knowledge/conditions/dermatology/benh_ghe.md), [trích dẫn lậu](../../knowledge/conditions/dermatology/benh_lau.md) cùng [nguồn BYT 75/2015](../../knowledge/sources/moh_qd_75_2015.md). Không sửa các file nguồn này.
- [Quy tắc trích xuất hiện có](../../server/app/ai/llm/prompts/extraction_v2.txt): không nhắc triệu chứng thì bỏ, chỉ phủ định mới gán ABSENT. Đây là căn cứ kiểm nhãn; không sửa prompt.

## Phạm vi thay đổi

Đúng 5 ID khác byte so với v1.3. Cập nhật ngày 16/11/2026: 4 ID thay nhãn, CLIN-019 chỉ đổi metadata và giữ nhãn chờ bác sĩ. 106 ca khác nguyên từng byte, gồm EXT-011. Mọi clinical_note giữ nguyên; không thêm clinical_note vào CLIN-019. Phản hồi mới do người giao việc cung cấp trong hội thoại, không suy ra chữ ký bác sĩ hoặc ghi APPROVED.

## CLIN-019

Nhận xét Huy đầy đủ trong phiếu ngày 2026-11-11 (giữ làm lịch sử):

> PRESENT hiện chỉ có 2 mã chung (pruritus_intense_skin_itch;vesicular_blister_rash), thiếu mã then chốt scabies_interdigital_burrows_nocturnal hoặc atopic_dermatitis_flexural_eczema nên cả benh_ghe (#7) và viem_da_co_dia (#15) đều rớt khỏi Top-5. Đề xuất bổ sung scabies_interdigital_burrows_nocturnal ở v1.4.

Nhãn cũ v1.3:

```json
{
  "symptoms": {
    "pruritus_intense_skin_itch": "PRESENT",
    "vesicular_blister_rash": "PRESENT",
    "fever_high": "ABSENT"
  },
  "expected_priority": "Routine",
  "expected_triggered_rules": [],
  "expected_top_conditions": [
    "benh_ghe",
    "viem_da_co_dia"
  ]
}
```

Nhãn trong bản v1.4 hiện tại:

```json
{
  "symptoms": {
    "pruritus_intense_skin_itch": "PRESENT",
    "vesicular_blister_rash": "PRESENT",
    "fever_high": "ABSENT"
  },
  "expected_priority": "Routine",
  "expected_triggered_rules": [],
  "expected_top_conditions": [
    "benh_ghe",
    "viem_da_co_dia"
  ]
}
```

Theo xác nhận người giao việc ngày 16/11/2026, giữ nguyên toàn bộ nhãn và sinh hiệu v1.3; không thêm clinical_note hoặc mã ghẻ/viêm da cơ địa. CẦN BÁC SĨ QUYẾT sau khi xác minh dữ kiện; checklist nằm ngoài JSONL trong CHANGES.md. Không dùng thứ hạng DDx để sửa nhãn.

Trạng thái: **CẦN BÁC SĨ QUYẾT**.

Phản hồi người giao việc ngày 16/11: đồng ý giữ nguyên nhãn và chờ bác sĩ. Ca chỉ có tuổi 14, nhiệt độ 36,9°C, ngứa/mụn nước PRESENT và fever_high ABSENT; không có clinical_note. Không có căn cứ tự thêm mã ghẻ hoặc viêm da cơ địa, không dùng thứ hạng DDx làm căn cứ.

Checklist cần bác sĩ xác minh từ dữ kiện thật (chỉ để ngoài JSONL):

1. Thời điểm ngứa: có tăng dữ dội về đêm không?
2. Phân bố/hình thái: vị trí mụn nước và có/không đường hầm trên nền da lành; phân biệt với tổn thương chàm ở nếp gấp. Các vị trí kẽ ngón, ngấn cổ tay, vùng da mỏng/quanh rốn/sinh dục hoặc nếp gấp khuỷu/khoeo/cổ là câu hỏi người giao việc đề nghị kiểm tra, không phải dữ kiện đã có của ca.
3. Dịch tễ/tiền sử: người tiếp xúc có ngứa tương tự không, có tiền sử dị ứng bản thân/gia đình không? Không mặc định có một trong các dữ kiện này.
4. Nếu thực sự đã làm: kết quả soi tìm ký sinh trùng tại thương tổn. Không tự ghi là đã làm hoặc đã dương tính.

Căn cứ thuật ngữ: [trích dẫn ghẻ](../../knowledge/conditions/dermatology/benh_ghe.md), [trích dẫn viêm da cơ địa](../../knowledge/conditions/dermatology/viem_da_co_dia.md), catalog và nguồn QĐ 75/QĐ-BYT sẵn có. Tài liệu viêm da cơ địa nêu tổn thương nếp gấp và tiền sử dị ứng; ghẻ nêu ngứa về đêm, mụn nước trên da lành và soi tìm ký sinh trùng. Chỉ ánh xạ mã/bổ sung clinical_note sau khi có dữ kiện bác sĩ xác minh và chỉ dẫn cập nhật riêng. **CẦN BÁC SĨ QUYẾT**.
## EXT-010

Nhận xét Huy đầy đủ trong phiếu ngày 2026-11-11 (giữ làm lịch sử):

> 2 mã PRESENT (inflammatory_sacroiliac_back_pain, enthesitis_achilles_heel) khớp sát văn bản. Tuy nhiên nhãn ABSENT gán mechanical_spinal_pain_stiffness từ cụm 'nằm nghỉ không giảm' là suy luận loại trừ lâm sàng chứ câu văn không phủ định trực tiếp đau cơ học; nếu chấm extraction chặt nên cân nhắc bỏ khỏi ABSENT ở bản v1.4.

Nhãn cũ v1.3:

```json
{
  "expected_symptoms": {
    "inflammatory_sacroiliac_back_pain": "PRESENT",
    "enthesitis_achilles_heel": "PRESENT",
    "mechanical_spinal_pain_stiffness": "ABSENT"
  }
}
```

Nhãn trong bản v1.4 hiện tại:

```json
{
  "expected_symptoms": {
    "inflammatory_sacroiliac_back_pain": "PRESENT",
    "enthesitis_achilles_heel": "PRESENT"
  }
}
```

Áp dụng phương án A theo xác nhận rõ của người giao việc ngày 16/11/2026: bỏ mechanical_spinal_pain_stiffness=ABSENT; chỉ giữ inflammatory_sacroiliac_back_pain=PRESENT và enthesitis_achilles_heel=PRESENT. Văn bản mô tả tính chất đau kiểu viêm, không phủ định trực tiếp đau kiểu cơ học; không suy luận loại trừ giữa hai mã khác nhau. Chính sách không đảo thống nhất EXT-011 về đối chiếu 15 phút với ngưỡng >1 giờ trên cùng thông số thời gian.

Trạng thái: **USER_CONFIRMED_PROPOSAL; PENDING_CROSS_REVIEW**.

## Phạm vi chính sách EXT-010 đã được chọn

**Phương án A đã được người giao việc xác nhận ngày 16/11/2026.** Câu “tập thể dục vận động thì đỡ đau nhưng nằm nghỉ không giảm” mô tả thuộc tính đau kiểu viêm, không phủ định trực tiếp đau kiểu cơ học; không suy luận loại trừ từ một mã bệnh lý/cơ chế sang mã khác để gán ABSENT.

| Phương án | Nội dung | Trạng thái |
|---|---|---|
| A | Bỏ mechanical_spinal_pain_stiffness=ABSENT, giữ hai PRESENT. | ĐÃ CHỌN theo người giao việc |
| B | Giữ ABSENT theo suy luận thuộc tính giữa hai mã. | KHÔNG CHỌN; chỉ giữ lịch sử phương án |

Ngoại lệ phạm vi đã được xác nhận: **không đảo EXT-011**. Đối chiếu 15 phút với ngưỡng >1 giờ là trên cùng một thông số thời gian cứng khớp; không áp dụng ngược chính sách loại trừ giữa hai mã khác nhau. EXT-011 giữ nguyên byte cả so với v1.3 và v1.4 trước cập nhật. Phạm vi toàn bộ v1.4 vẫn đúng 5 ID.

Đã đọc lại extraction_v2.txt và [extraction_phrases_v2.txt](../../server/app/ai/llm/prompts/extraction_phrases_v2.txt): mã không được nhắc phải bỏ, ABSENT dành cho phủ định rõ. Phản hồi người giao việc có nhắc v4; **chưa tìm thấy tệp extraction_phrases_v4 trong repo hiện tại**, nên không ghi là đã đối chiếu v4 và không sửa/bổ sung prompt đó. Không sửa prompt, KB hoặc luật trong việc này.
## EXT-014

Nhận xét Huy đầy đủ (phiếu ngày 2026-11-11):

> PRESENT (tendinitis_finkelstein_trigger_elbow) khớp chính xác. Tuy nhiên văn bản KHÔNG nhắc tới sốt nhưng nhãn ABSENT lại có fever_high; cần bỏ fever_high khỏi ABSENT (hoặc thêm 'không sốt' vào câu văn) nếu tách v1.4 để không phạt oan bộ trích xuất.

Nhãn cũ:

```json
{
  "expected_symptoms": {
    "tendinitis_finkelstein_trigger_elbow": "PRESENT",
    "fever_high": "ABSENT"
  }
}
```

Nhãn trong bản v1.4:

```json
{
  "expected_symptoms": {
    "tendinitis_finkelstein_trigger_elbow": "PRESENT"
  }
}
```

Văn bản không đề cập sốt và không có dữ kiện phủ định sốt: bỏ fever_high=ABSENT; không chèn thêm không sốt vào văn bản.

Trạng thái: **USER_CONFIRMED_PROPOSAL; PENDING_CROSS_REVIEW**. Người giao việc đã đồng ý trong phản hồi ngày 16/11; bản ghi JSONL này giữ nguyên byte so với v1.4 trước cập nhật.

## EXT-024

Nhận xét Huy đầy đủ (phiếu ngày 2026-11-11):

> Cần sửa 2 điểm nếu tách v1.4: (1) Văn bản nêu rõ 'ngứa dữ dội về đêm ở các kẽ ngón tay... kèm đường hầm luống ghẻ' nhưng PRESENT lại thiếu mã then chốt scabies_interdigital_burrows_nocturnal; (2) Văn bản không nhắc tới sốt nhưng ABSENT lại gán fever_high.

Nhãn cũ:

```json
{
  "expected_symptoms": {
    "pruritus_intense_skin_itch": "PRESENT",
    "vesicular_blister_rash": "PRESENT",
    "fever_high": "ABSENT"
  }
}
```

Nhãn trong bản v1.4:

```json
{
  "expected_symptoms": {
    "pruritus_intense_skin_itch": "PRESENT",
    "vesicular_blister_rash": "PRESENT",
    "scabies_interdigital_burrows_nocturnal": "PRESENT"
  }
}
```

Bỏ fever_high=ABSENT vì không nhắc sốt; thêm mã scabies_interdigital_burrows_nocturnal=PRESENT có sẵn, vì chính văn bản có ngứa đêm, kẽ ngón và đường hầm luống ghẻ. Không suy ra vị trí sinh dục chưa được nêu.

Trạng thái: **USER_CONFIRMED_PROPOSAL; PENDING_CROSS_REVIEW**. Người giao việc đã đồng ý trong phản hồi ngày 16/11; bản ghi JSONL này giữ nguyên byte so với v1.4 trước cập nhật.

Đối chiếu văn bản: “ngứa dữ dội về đêm”, “kẽ ngón tay”, “đường hầm luống ghẻ” có ngay trong clinical_note. Catalog có sẵn scabies_interdigital_burrows_nocturnal; không có khoảng trống mã cho đặc trưng này và không tạo mã mới. Tên mã là mô tả gộp nhiều vị trí; không suy ra tổn thương sinh dục từ ca này. Không sửa quan hệ/trọng số/ICD của KB.

## EXT-026

Nhận xét Huy đầy đủ (phiếu ngày 2026-11-11):

> PRESENT (genital_ulcer_chancre_discharge) khớp đúng triệu chứng tiểu buốt, chảy mủ niệu đạo. Tuy nhiên văn bản không nhắc tới sốt nhưng ABSENT lại gán fever_high; đề xuất bỏ fever_high khỏi ABSENT ở v1.4.

Nhãn cũ:

```json
{
  "expected_symptoms": {
    "genital_ulcer_chancre_discharge": "PRESENT",
    "fever_high": "ABSENT"
  }
}
```

Nhãn trong bản v1.4:

```json
{
  "expected_symptoms": {
    "genital_ulcer_chancre_discharge": "PRESENT",
    "gonorrhea_purulent_urethritis_dysuria": "PRESENT"
  }
}
```

Bỏ fever_high=ABSENT vì không nhắc sốt. Bổ sung gonorrhea_purulent_urethritis_dysuria=PRESENT theo thống nhất đã ghi ở README_review.md; văn bản nêu đái buốt, đái rắt và giọt mủ vàng xanh buổi sáng. Giữ mã chung genital_ulcer_chancre_discharge=PRESENT đã được Huy nhận xét phù hợp; không thay hoặc xóa mã chung.

Trạng thái: **USER_CONFIRMED_PROPOSAL; PENDING_CROSS_REVIEW**. Người giao việc đã đồng ý trong phản hồi ngày 16/11; bản ghi JSONL này giữ nguyên byte so với v1.4 trước cập nhật.

Ngoài nhận xét gốc, README_review.md mục “Kết luận bổ sung Huy và công việc riêng” đã ghi thống nhất dùng gonorrhea_purulent_urethritis_dysuria và bỏ ABSENT sốt trong v1.4. Vì vậy bổ sung mã cụ thể là dựa trên thống nhất đã được ghi, không tự quyết từ kết quả benchmark. Catalog mô tả “Tiểu buốt, tiểu rắt kèm chảy mủ niệu đạo đặc vàng xanh (giọt mủ ban mai)”; ca có đủ các dữ kiện đó. Giữ mã chung được Huy nhận xét phù hợp, không tự suy ra loét/săng hoặc biểu hiện khác trong tên mã gộp.

## Các mục còn chờ và ngoài phạm vi

- CLIN-019: CẦN BÁC SĨ QUYẾT; nhãn/sinh hiệu giữ v1.3, không có clinical_note mới. Checklist cần xác minh ở trên chưa phải dữ kiện ca.
- EXT-010: phương án A đã chọn theo xác nhận người giao việc; không còn CHỜ TUẤN+HUY QUYẾT về A/B. Không đảo EXT-011.
- EXT-014/024/026: người giao việc đã đồng ý, dữ liệu giữ nguyên so với bản v1.4 trước cập nhật.
- Manifest toàn bộ vẫn PENDING_CROSS_REVIEW, chưa đóng băng hoặc chạy benchmark, không tự ghi thẩm định lâm sàng. Những ca ngoài 5 ID và những vấn đề khác trong README_review.md không sửa.

## Kết quả diff tự động

```text
clinical_cases_labeled_v1.4.jsonl: 82 ca; khác 1; giống byte 81
symptom_extraction_testset_v1.4.jsonl: 29 ca; khác 4; giống byte 25
CLIN-019: review_status, revision_note; nhãn GIỮ V1.3
EXT-010: expected_symptoms, review_status, revision_note; nhãn ĐỔI
EXT-014: expected_symptoms, review_status, revision_note; nhãn ĐỔI
EXT-024: expected_symptoms, review_status, revision_note; nhãn ĐỔI
EXT-026: expected_symptoms, review_status, revision_note; nhãn ĐỔI
TỔNG: khác 5 ID; 106 ca giống từng byte; EXT-011 nguyên byte; EXT-010 chọn A
```

## Tự đánh giá A–E — cập nhật 16/11/2026

| A — Yêu cầu gốc và phản hồi mới | Đã làm / bằng chứng | E — Kết luận |
|---|---|---|
| Giữ bộ riêng 82+29 ca, đúng 5 ID khác và 106 ca nguyên byte | Hai JSONL, manifest và kết quả diff trên; v1.3 và KB không đổi. | ĐẠT |
| EXT-010 áp dụng A, chỉ còn hai PRESENT | expected_symptoms bỏ mechanical_spinal_pain_stiffness; manifest selected_option=A, có nguồn xác nhận và phạm vi. | ĐẠT |
| Không đảo EXT-011 | Verifier so byte với v1.3 và hash trước cập nhật v1.4; không đổi nhãn 15 phút/>1 giờ. | ĐẠT |
| CLIN-019 giữ nhãn, chờ bác sĩ và không tự thêm dữ kiện | Chỉ đổi revision_note sang CẦN BÁC SĨ QUYẾT; toàn bộ nhãn/sinh hiệu giữ v1.3, clinical_note vẫn không có. Checklist ở ngoài JSONL. | ĐẠT CÓ ĐIỀU KIỆN: bác sĩ xác minh |
| Áp dụng EXT-014/024/026 như đã đồng ý | Đã có đúng nhãn đề xuất từ bản trước, giữ nguyên byte ba bản ghi; verifier đối chiếu các hash trước cập nhật. | ĐẠT |
| Nhận xét Huy đầy đủ và nhãn cũ/mới có lý do | Năm nhận xét gốc vẫn nguyên chuỗi từ CSV trong manifest và trên tài liệu; phản hồi mới được ghi là do người giao việc cung cấp. | ĐẠT |
| Tái lập hash/công thức, kiểm mã/ID/KB | Verifier và phép tính PowerShell độc lập; không mã lạ/ID trùng, toàn bộ 179 file KB giữ nguyên. | ĐẠT |
| Chưa thẩm định/đóng băng hoặc benchmark, không sửa runner | PENDING_CROSS_REVIEW, is_frozen=false, NOT_RUN; lưu ý tên file run_eval.py vẫn giữ trong README. | ĐẠT |

B — Đã chạy kiểm trên bộ dữ liệu sau quyết định, và chạy lại từ đầu trên bản cuối bằng lệnh:

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
.\venv\Scripts\python.exe evaluation/testset_v1.4/verify_v1_4.py
git status --short --untracked-files=all
git diff --stat
git diff --check
```

Kết quả thực: PASS; 5 ID khác, 106 ca nguyên byte; 4 ID đổi nhãn; CLIN-019 giữ nhãn chờ bác sĩ; EXT-011 và ba bản ghi EXT-014/024/026 nguyên byte so với mốc cần giữ. SHA-256 chuẩn hóa CRLF→LF được tính lại độc lập bằng PowerShell, extraction trước clinical, và khớp manifest.

C — Soát phản biện: không biến checklist thành bệnh sử có thật; không suy ra chẩn đoán hay gán mã mới cho CLIN-019; không suy loại trừ từ đau kiểu viêm sang ABSENT đau cơ học. Giữ nguyên ngoại lệ cùng thông số thời gian ở EXT-011; không mở rộng chính sách ra ngoài phạm vi được xác nhận. Nhãn mới dựa văn bản và phản hồi người giao việc, không dùng kết quả pipeline. Review_status lịch sử của 106 ca sao nguyên byte không phải phê duyệt v1.4.

D — Sau tự rà đã bỏ các câu hiện hành còn nói chưa chọn A/B hoặc chỉ có ba ca đổi nhãn; giữ B riêng làm lịch sử không chọn. Đã làm rõ CLIN-019 chỉ còn chờ bác sĩ và checklist không vào JSONL. Ghi đúng giới hạn nguồn: chưa thấy prompt v4 trong repo, không tuyên bố đã đọc; chỉ dẫn v2 có thật được đối chiếu và giữ nguyên. Không phát hiện lỗi dữ liệu trong lượt kiểm; đã bổ sung kiểm giữ nguyên byte EXT-011 và ba ca đã áp dụng, sau đó lặp lại A–C trên bản cuối.

E — Cập nhật theo phương án người giao việc xác nhận: ĐẠT. Toàn bộ v1.4: ĐẠT CÓ ĐIỀU KIỆN vì CLIN-019 còn CẦN BÁC SĨ QUYẾT và trạng thái toàn bộ vẫn PENDING_CROSS_REVIEW. Không gán chữ ký Huy/bác sĩ hoặc ghi APPROVED. Việc cần người thật: bác sĩ xác minh CLIN-019 trước mọi bổ sung clinical_note/mã; phần rà chéo/đóng băng và tích hợp runner v1.4 là công việc riêng. Không chạy benchmark trong lần này.

Hash v1.3: `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`.

Hash v1.4 sau phương án A: `a136d072e8c5149f25409591b245b61865e3320a5233ad73ef9d4d54aec86161`.
