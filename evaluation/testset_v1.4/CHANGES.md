# Thay đổi, rà chéo và giới hạn testset v1.4

Ngày tổng hợp: 16/11/2026. Bộ riêng cho KB-2026.11; trạng thái hiện tại lấy từ manifest. Phạm vi **5 ID** đã được Tuấn chốt, 4 ca đổi nhãn; **106 bản ghi khác nguyên byte**, gồm EXT-011. Hai JSONL giữ nguyên sau lượt rà. Không chạy pipeline/LLM/CSDL hoặc dùng thứ hạng để chọn nhãn.

## Nhãn thay đổi

| ID | Phương án đang lưu |
|---|---|
| CLIN-019 | Giữ toàn bộ nhãn, sinh hiệu, ưu tiên và DDx v1.3; chỉ đổi metadata chờ bác sĩ. Không thêm lời kể/mã. |
| EXT-010 | Phương án A: bỏ mechanical_spinal_pain_stiffness=ABSENT; giữ inflammatory_sacroiliac_back_pain và enthesitis_achilles_heel PRESENT. Không thay EXT-011. |
| EXT-014 | Giữ tendinitis_finkelstein_trigger_elbow=PRESENT; bỏ fever_high=ABSENT vì không nhắc sốt. |
| EXT-024 | Giữ hai mã ngứa/mụn nước; thêm scabies_interdigital_burrows_nocturnal=PRESENT; bỏ fever_high=ABSENT. Không suy thêm vị trí sinh dục. |
| EXT-026 | Giữ genital_ulcer_chancre_discharge=PRESENT; thêm gonorrhea_purulent_urethritis_dysuria=PRESENT; bỏ fever_high=ABSENT. Không suy thêm loét/săng. |

Nhãn cũ/mới đầy đủ, nhận xét gốc và các trường đổi nằm trong manifest_freeze.json mục case_changes. Hai JSONL v1.3 và manifest v1.3 không đổi.

## Nhận xét gốc của Huy ngày 11/11/2026

### CLIN-019

> PRESENT hiện chỉ có 2 mã chung (pruritus_intense_skin_itch;vesicular_blister_rash), thiếu mã then chốt scabies_interdigital_burrows_nocturnal hoặc atopic_dermatitis_flexural_eczema nên cả benh_ghe (#7) và viem_da_co_dia (#15) đều rớt khỏi Top-5. Đề xuất bổ sung scabies_interdigital_burrows_nocturnal ở v1.4.

### EXT-010

> 2 mã PRESENT (inflammatory_sacroiliac_back_pain, enthesitis_achilles_heel) khớp sát văn bản. Tuy nhiên nhãn ABSENT gán mechanical_spinal_pain_stiffness từ cụm 'nằm nghỉ không giảm' là suy luận loại trừ lâm sàng chứ câu văn không phủ định trực tiếp đau cơ học; nếu chấm extraction chặt nên cân nhắc bỏ khỏi ABSENT ở bản v1.4.

### EXT-014

> PRESENT (tendinitis_finkelstein_trigger_elbow) khớp chính xác. Tuy nhiên văn bản KHÔNG nhắc tới sốt nhưng nhãn ABSENT lại có fever_high; cần bỏ fever_high khỏi ABSENT (hoặc thêm 'không sốt' vào câu văn) nếu tách v1.4 để không phạt oan bộ trích xuất.

### EXT-024

> Cần sửa 2 điểm nếu tách v1.4: (1) Văn bản nêu rõ 'ngứa dữ dội về đêm ở các kẽ ngón tay... kèm đường hầm luống ghẻ' nhưng PRESENT lại thiếu mã then chốt scabies_interdigital_burrows_nocturnal; (2) Văn bản không nhắc tới sốt nhưng ABSENT lại gán fever_high.

### EXT-026

> PRESENT (genital_ulcer_chancre_discharge) khớp đúng triệu chứng tiểu buốt, chảy mủ niệu đạo. Tuy nhiên văn bản không nhắc tới sốt nhưng ABSENT lại gán fever_high; đề xuất bỏ fever_high khỏi ABSENT ở v1.4.

<a id="kiem-chung"></a>
## Kiểm chứng kỹ thuật và căn cứ

- 82 ca lâm sàng + 29 ca trích xuất; không ID trùng, mã lạ; 179 tệp KB khớp snapshot. So với v1.3: đúng năm ID khác byte; 106 bản ghi nguyên byte; mọi lời kể và EXT-011 nguyên byte.
- Quy tắc [extraction_v2.txt](../../server/app/ai/llm/prompts/extraction_v2.txt) và [extraction_phrases_v2.txt](../../server/app/ai/llm/prompts/extraction_phrases_v2.txt): chỉ phủ định rõ mới ABSENT, triệu chứng không nhắc phải bỏ. EXT-010 không suy loại trừ giữa hai mã cơ chế khác nhau; ngoại lệ thời gian cùng thông số ở EXT-011 được giữ theo quyết định đã chốt.
- Đối chiếu [catalog](../../knowledge/symptoms/symptom_catalog.md), [ghẻ](../../knowledge/conditions/dermatology/benh_ghe.md), [lậu](../../knowledge/conditions/dermatology/benh_lau.md), [viêm da cơ địa](../../knowledge/conditions/dermatology/viem_da_co_dia.md), [QĐ 75/QĐ-BYT](../../knowledge/sources/moh_qd_75_2015.md). Các mã đặc trưng đã có trong KB. Trích đoạn hồ sơ không phải toàn văn BYT; cụm đường hầm ghẻ có trong ca/catalog nhưng thiếu nguyên cụm trong trích đoạn benh_ghe.md.
- CLIN-019 chưa có dữ kiện đặc trưng để thêm mã. Bác sĩ cần xác minh thời điểm ngứa, phân bố/hình thái, người tiếp xúc/tiền sử dị ứng và kết quả soi ký sinh trùng nếu thực sự có làm; checklist không phải bệnh sử mới và không đưa vào JSONL.
- Kiểm kỹ thuật PASS không thay thẩm định lâm sàng. Huy chỉ xác nhận nội dung năm ID; 106 ca sao từ v1.3 giữ cả trạng thái và vấn đề lịch sử, không được coi là đã hết vấn đề.

<a id="phan-hoi-huy"></a>
## Phản hồi Huy ngày 16/11/2026

Nguồn: nội dung Huy do Tuấn chuyển lại; ngày phản hồi và ghi nhận 16/11/2026. Đoạn dưới giữ nội dung phản hồi ban đầu. Tên tệp được nhắc phản ánh thời điểm gửi; các biên bản nay đã gộp vào tài liệu này.

<!-- BEGIN HUY_FEEDBACK_2026_11_16 -->
Tuấn ơi, mình đã đọc kỹ CHANGES.md và rà 6 file bộ v1.4 bạn gửi. Mình phản hồi từng ID như sau:

1. EXT-010 — ĐỒNG Ý với hướng đưa ra 2 phương án để chốt, và mình chọn PHƯƠNG ÁN A:
- Phương án chọn: A — chỉ nhận phủ định trực tiếp; bỏ `mechanical_spinal_pain_stiffness: ABSENT` khỏi `expected_symptoms` của EXT-010 (chỉ giữ `inflammatory_sacroiliac_back_pain: PRESENT` và `enthesitis_achilles_heel: PRESENT`).
- Lý do: Quy tắc trích xuất hiện hành (`extraction_v2.txt` và `extraction_phrases_v2/v4`) đều quy định chỉ gán `ABSENT` khi biểu hiện đó được phủ định rõ trong văn bản; câu "tập thể dục vận động thì đỡ đau nhưng nằm nghỉ không giảm" đang mô tả đặc tính đau kiểu viêm, không hề nhắc hay phủ định "đau kiểu cơ học". Không nên buộc bước trích xuất phải suy luận loại trừ sang một mã hội chứng/cơ chế đau khác.
- Phạm vi chính sách của Phương án A: Áp dụng cho việc **suy luận loại trừ giữa hai mã bệnh lý/cơ chế khác nhau** (như đau kiểu viêm vs đau kiểu cơ học ở EXT-010). **Không** áp dụng ngược lại để đảo thống nhất đã chốt cho EXT-011 (15 phút đối chiếu trực tiếp với ngưỡng > 1 giờ trên cùng một thông số thời gian cứng khớp, và vẫn giữ phạm vi v1.4 đúng 5 ID).

2. CLIN-019 — ĐỒNG Ý giữ nguyên nhãn v1.3 và gắn trạng thái CẦN BÁC SĨ QUYẾT:
- Lý do: Dữ kiện hiện có của ca chỉ là 14 tuổi, nhiệt độ 36.9°C, `pruritus_intense_skin_itch: PRESENT`, `vesicular_blister_rash: PRESENT`, `fever_high: ABSENT` và không có `clinical_note`. Hoàn toàn không có căn cứ nào trong ca để tự thêm `scabies_interdigital_burrows_nocturnal` hay `atopic_dermatitis_flexural_eczema`, và mình thống nhất không dùng thứ hạng DDx để sửa nhãn.
- Đánh giá hướng làm rõ dữ kiện & các dữ kiện có thể xác minh: Mình đồng ý với khung thu thập dữ kiện bạn đề xuất trong CHANGES.md (để ngoài JSONL). Khi nhờ bác sĩ lâm sàng rà/bổ sung cho ca 14 tuổi ngứa + mụn nước không sốt này, cần xác minh các dữ kiện sau (dựa theo mô tả QĐ 75/QĐ-BYT trong `benh_ghe.md` và `viem_da_co_dia.md`):
  (1) Thời điểm ngứa: có ngứa tăng dữ dội về đêm không;
  (2) Vị trí phân bố và hình thái tổn thương: mụn nước ở kẽ ngón tay, ngấn cổ tay, vùng da mỏng/quanh rốn/sinh dục và có đường hầm luống ghẻ trên nền da lành hay là tổn thương dạng chàm ở nếp gấp (khuỷu, khoeo, cổ);
  (3) Dịch tễ/tiền sử: có người nhà/bạn bè cùng ngứa tương tự không, hoặc tiền sử dị ứng bản thân/gia đình (hen, viêm mũi dị ứng);
  (4) Cận lâm sàng (nếu thực sự có làm): kết quả soi tìm ký sinh trùng (cái ghẻ) tại thương tổn.
- Nếu bổ sung ở v1.4 sau khi bác sĩ chốt ca: nên kèm `clinical_note` đã được bác sĩ xác minh các dữ kiện trên rồi mới ánh xạ mã; hiện tại cứ giữ nguyên nhãn v1.3 chờ bác sĩ quyết.

3. EXT-014 — ĐỒNG Ý:
- Lý do: Câu văn không nhắc tới sốt và không có phủ định sốt. Giữ nguyên `clinical_note`, bỏ `fever_high: ABSENT` và chỉ giữ `tendinitis_finkelstein_trigger_elbow: PRESENT` là đúng quy tắc trích xuất và phản hồi ngày 11/11.

4. EXT-024 — ĐỒNG Ý:
- Lý do:
  (1) Văn bản không nhắc tới sốt → bỏ `fever_high: ABSENT` là đúng;
  (2) Chính văn bản nêu rõ "ngứa dữ dội về đêm ở các kẽ ngón tay... kèm đường hầm luống ghẻ" và "mụn nước", khớp với mã có sẵn `scabies_interdigital_burrows_nocturnal: PRESENT` (cùng 2 mã chung `pruritus_intense_skin_itch` và `vesicular_blister_rash`, không suy thêm vị trí sinh dục).

5. EXT-026 — ĐỒNG Ý:
- Lý do:
  (1) Văn bản không nhắc sốt → bỏ `fever_high: ABSENT` là đúng;
  (2) Văn bản mô tả trực tiếp "đái buốt, đái rắt và chảy giọt mủ vàng xanh từ miệng sáo vào buổi sáng", khớp đúng với mã `gonorrhea_purulent_urethritis_dysuria` trong `symptom_catalog.md` và thống nhất trước đó trong `README_review.md`; vẫn giữ mã chung `genital_ulcer_chancre_discharge: PRESENT` và không suy diễn thêm loét/săng.

Bạn cập nhật Phương án A cho EXT-010 (bỏ `mechanical_spinal_pain_stiffness: ABSENT`), giữ `CLIN-019` chờ bác sĩ quyết và áp dụng 3 ca EXT-014/024/026 nhé. Về phần lưu ý `run_eval.py` đọc file chưa có hậu tố `_v1.4`, khi nào cần chạy benchmark v1.4 mình và Sơn sẽ phối hợp xử lý ở việc riêng như bạn ghi.
<!-- END HUY_FEEDBACK_2026_11_16 -->

<a id="pham-vi"></a>
## Phản hồi bổ sung và quyết định phạm vi

Nguồn: phản hồi bổ sung Huy do Tuấn chuyển lại, ghi nhận 16/11/2026. Nội dung dưới là bản tổng hợp đã ghi nhận, không phải xác nhận chạy công cụ trên máy Huy. Các tên CROSS_REVIEW/CHANGES trong danh sách tệp Huy đã đọc là tên lịch sử trước khi gộp.

## Phạm vi xác nhận

- Huy đã đọc README.md, CROSS_REVIEW.md, manifest_freeze.json, CHANGES.md và đối chiếu hai JSONL được gửi.
- Huy chỉ xác nhận nhãn/nội dung **5 ID**: CLIN-019, EXT-010, EXT-014, EXT-024, EXT-026. Không xác nhận mới toàn bộ 111 ca; 106 ca còn lại giữ dữ liệu và các vấn đề từ v1.3.
- Huy đối chiếu thủ công thấy EXT-010 áp dụng A; EXT-014/024/026 khớp phương án; CLIN-019 và EXT-011 giữ nhãn v1.3. Huy **chưa tự chạy verify_v1_4.py** vì thư mục v1.4 chưa có trên nhánh của Huy; không có hash tệp được Huy xác nhận.

## Kết luận từng điểm

| Điểm | Phản hồi Huy | Trạng thái ghi nhận |
|---|---|---|
| CLIN-019 | Giữ nhãn v1.3, ghi CẦN BÁC SĨ QUYẾT; không thêm lời kể/mã khi thiếu xác minh bác sĩ. | Chấp nhận giữ nguyên với giới hạn; checklist ngoài JSONL. |
| EXT-022/023 | Khuyến nghị bỏ fever_high=ABSENT trước khi đóng băng vì lời kể không nhắc sốt, để nhất quán quy tắc trích xuất. Nếu vẫn giữ phạm vi năm ID thì phải nêu rõ giới hạn. | Tuấn chọn **giữ đúng năm ID**, ghi rõ giới hạn EXT-022/023. Hai ca giữ nguyên; khuyến nghị sửa của Huy được bảo lưu cho việc riêng. |
| EXT-024 | Giữ nhãn v1.4 và ghi rõ thiếu trích đoạn BYT. Đường hầm ghẻ có trong ca và catalog; theo Huy, giới hạn này không chặn đóng băng testset trích xuất. | Chấp nhận giới hạn cho testset; hồ sơ nguồn KB để rà riêng, không sửa KB trong việc này. |
| Các điểm khác | Không có điểm sửa mới trong năm ID; tên ba tệp chuẩn khớp runner. CLIN-021/022 và mã gộp EXT-018/019/021/027/028 tiếp tục chờ bác sĩ/công việc riêng. | Giữ nguyên dữ liệu và ghi giới hạn; không suy ra tất cả nhãn đã được thẩm định lâm sàng. |

Đề nghị sửa EXT-022/023 dựa trên văn bản và quy tắc nhãn. Không dùng nhận định về điểm phạt mô hình để điều chỉnh KB, prompt, luật hoặc testset.

## Làm rõ tài liệu và bước tiếp theo

- Theo Huy, extraction_phrases_v4 là bản nháp untracked trên máy Huy. Đây là thông tin do Huy cung cấp; không ghi thành đã kiểm tệp trên máy đó. Repo hiện có extraction_v2.txt, extraction_phrases_v2.txt và extraction_phrases_compact_v3.txt; không bổ sung hoặc sửa prompt.
- Phản hồi này bổ sung cho [phản hồi ban đầu](#phan-hoi-huy), không thay đổi giới hạn phạm vi xác nhận năm ID.
- Tuấn chọn giữ năm ID và ghi rõ giới hạn EXT-022/023; đây không phải xác nhận nhãn hai ca đúng hoặc phê duyệt lâm sàng. Trạng thái đóng băng hiện tại lấy từ manifest.


## Giới hạn đi kèm bộ dữ liệu

| Điểm | Cách xử lý đã chốt |
|---|---|
| CLIN-019 | Giữ nhãn v1.3; CẦN BÁC SĨ QUYẾT trước mọi bổ sung lời kể/mã. |
| EXT-022/023 | Vẫn giữ fever_high=ABSENT dù lời kể không nhắc sốt. Huy khuyến nghị bỏ; Tuấn chọn giữ phạm vi năm ID và ghi rõ giới hạn. Đây không phải xác nhận nhãn phù hợp văn bản. |
| EXT-024 | Giữ nhãn; theo Huy giới hạn trích đoạn nguồn BYT không chặn đóng băng testset trích xuất. Hoàn thiện nguồn KB là việc riêng. |
| Các ca khác | CLIN-021/022 và mã gộp EXT-018/019/021/027/028 giữ các vấn đề chờ bác sĩ tại README_review.md. Không xác nhận mới toàn bộ 111 ca. |

Theo Huy, extraction_phrases_v4 là bản nháp untracked trên máy Huy; không được kiểm trực tiếp tại đây. Repo hiện có extraction_v2, extraction_phrases_v2 và extraction_phrases_compact_v3; không sửa prompt.

## Kiểm lại

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
.\venv\Scripts\python.exe evaluation/testset_v1.4/verify_v1_4.py
```

Kỳ vọng PASS: 82+29 ca, 5 ID khác byte, 106 bản ghi nguyên byte; 179 tệp KB và hash v1.3 khớp. Combined v1.4 `a136d072e8c5149f25409591b245b61865e3320a5233ad73ef9d4d54aec86161`; v1.3 `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`.
