# Nghiệm thu kỹ thuật KB-2026.11 — 11/11/2026

## Kết quả và phạm vi

| Mục | Trước | Sau |
|---|---:|---:|
| Bệnh | 169 | 153 |
| Da liễu / TMH / cơ xương khớp / mắt / nhiễm trùng / hô hấp | 58 / 43 / 31 / 24 / 11 / 2 | 56 / 36 / 28 / 20 / 11 / 2 |
| Triệu chứng / luật / nguồn | 299 / 12 / 11 | 299 / 12 / 11 |
| Quan hệ trên đĩa và Active staging | 1744 | 1522 |
| Trích dẫn | 172 | 156 |
| Bệnh không có then chốt | 30 | 16 |

Gỡ 16 hồ sơ: 11 bệnh nặng và 5 hồ sơ triệu chứng; gỡ 199 quan hệ theo hồ sơ và 23 liên kết NV2. Thêm 9 then chốt từ liên kết có sẵn, gồm đủ 4 bệnh TMH ưu tiên. Chỉ sửa 2 ICD được giao. Không thêm mã/bệnh/quan hệ; không chỉnh luật hoặc catalog so với trạng thái bắt đầu. Hai tệp đóng băng không đổi: combined_sha256 `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`.

## Các mục người thật cần xem trước khi chốt tài liệu

1. `safety_coverage.md`: nhận xét Huy cho đủ 11 bệnh, phân biệt mã đặc trưng và khám ban đầu. Khoảng trống điếc đột ngột được người giao việc chấp nhận để tiếp tục; không gọi đây là phê duyệt bác sĩ hoặc sửa xong luật. Đề xuất luật/trích xuất là công việc riêng, không triển khai trong PR KB này.
2. `key_symptoms.csv`: 9 then chốt CHƯA RÀ LÂM SÀNG; `conditions_without_key.json`: 16 bệnh chưa có lựa chọn đủ chắc. Mã gộp và mã không chứa thời gian mạn tính có giới hạn đã ghi rõ.
3. `cross_links.csv`: 23 XÓA, 112 GIỮ, 597 CẦN BÁC SĨ QUYẾT. Phân loại hỗ trợ đủ 299 mã và 122 tên có ngoặc trong `symptom_name_audit.csv` chưa phải phê duyệt chuyên môn; các tên gộp/không rõ chủ cần tiếp tục rà. 395 ứng viên cũ vẫn hiện diện được đưa vào bảng, không bỏ qua.
4. ICD L40.5 và M09.0: ICD CẦN BÁC SĨ XÁC NHẬN cách dùng một mã tại Việt Nam; M09.0 là mã dấu sao đi kèm bệnh nền. Chưa có bảng ICD-10 Bộ Y tế tiếng Việt để đối chiếu. Nguồn quốc tế hỗ trợ: https://ais.paho.org/classifications/chapters/CAP13.html . Không sửa ICD khác.
5. Rà chéo v1.3 đã nhận phản hồi Huy và xác nhận Tuấn: 106 ĐỒNG Ý, 5 CẦN SỬA, cùng các lưu ý bổ sung. Xem ba tệp cuối ở `evaluation/review/`. Giữ nhãn v1.3; CLIN-022 không bỏ Herpes theo thứ hạng, EXT-011 giữ nhãn theo thời lượng 15 phút; sửa nhãn sang v1.4 riêng. Không khẳng định mọi ca đạt hoặc đã giải quyết mọi vấn đề an toàn.

## Kiểm chứng thực tế

- Pytest trước sửa: 1.388 passed / 250,43 giây; sau sửa: 1.388 passed / 227,93 giây. Bao gồm `tests/api/test_seed_eval.py`. Không sửa mã/test Python.
- Dry-run cuối: mã thoát 0, 0 lỗi thư mục; nguyên văn trong `dry_run_final.log`. 0 new; 2 condition changed, 9 relation changed; 254 missing = 16 bệnh + 199 quan hệ theo hồ sơ + 16 trích dẫn + 23 liên kết NV2. Các loại khác giữ nguyên.
- Staging riêng `medassist_kb202611_stage_20261111` được sao từ staging KB-2026.10 dựng lại bằng Alembic và kho trước sửa; không đọc/sao CSDL nguồn `medassist`. Tài khoản `kb_stage_physician_test` chỉ mô phỏng duyệt kỹ thuật staging, không đại diện Tuấn/Huy/Sơn/bác sĩ. Nạp `--retire-missing --approve-as kb_stage_physician_test` thành công; `staging_acceptance.json` xác nhận Active khớp đĩa, 0 changes, 0 missing. Retired total gồm cả bản cũ của 2 ICD và 9 quan hệ đổi then chốt, không chỉ mục bị gỡ.
- Seed demo đầy đủ catalog trên staging demo riêng thành công: 34 lượt cũ, 15 lượt hôm nay. Lần bỏ catalog trước đó lỗi PRESCRIPTION_NOT_CONFIRMED, giữ log nguyên trạng và không quy lỗi này cho KB. Ba ca DEMO2-100/119/120 được kiểm trực tiếp intake/examine và rollback: không vỡ, dùng chẩn đoán văn bản tự do thay liên kết bệnh Active. Đây không phải chứng nhận an toàn lâm sàng.
- RuleOnly đúng 1 lần trên staging .11, LLM_PROVIDER=none, skip-extraction: recall cờ đỏ 48/48, báo nhầm 0, mức ưu tiên 82/82, luật P/R/F1=1/1/1; DDx top-1=15/18, top-3=17/18. Các chỉ số này bằng đợt .10; có thay đổi thứ hạng ở 5 ca, xem `rule_only/so_sanh_voi_KB-2026.10.md`. Chỉ phủ 27/153 bệnh, không đánh giá đủ toàn KB. Server lịch sử 0.2.2 khác hiện tại 0.2.4 nên không suy diễn ảnh hưởng chỉ do KB. Không chạy Full/trích xuất; không chỉnh KB sau kết quả.
- `rule_only_once.json` lưu một lần gọi và hash từng tệp KB; kiểm sau đánh giá các hash không đổi. Manifest chỉ cập nhật snapshot theo quyền rõ ràng tại mục F của yêu cầu gốc; không đổi hash, thống kê, benchmark_status hoặc review_status.

## Ngoài phạm vi và phần chưa hoàn tất

- Chủ server cần rà lại ba ca demo còn condition_code đã gỡ; fallback không vỡ nhưng mất liên kết bệnh chuẩn. Không sửa `server/data/eval_cases.jsonl` trong PR này.
- README.md:20, server/README.md:154, docs/huong-dan-kiem-thu.md:87 và docs/huong-dan-demo-kiem-thu-ai.md:10 được đề bài nêu có số liệu cũ; cần chủ thư mục cập nhật. Số hiện tại 153 bệnh, 299 triệu chứng, 12 luật. `icd_other_references.txt` lưu kết quả dò M89.9/M89.0 trước phát hành.
- Chưa có phê duyệt bác sĩ cho then chốt/ICD/các liên kết chờ; chưa sửa luật hoặc v1.4. Không merge, tạo tag hoặc nạp CSDL đang chạy.
- Nhánh có sẵn thay đổi heading của catalog/rf_out_of_scope đã staged trước công việc. Giữ nguyên các thay đổi đó ngoài commit của công việc này; logic luật và mã/tên catalog không đổi.
- Không tuyên bố đã đóng băng để gửi giảng viên y khoa; nghiệm thu kỹ thuật không thay phê duyệt lâm sàng.
- Đã tạo commit tại máy cho dữ liệu, tài liệu và log kiểm chứng; chỉ gồm knowledge/evaluation, không đưa hai thay đổi heading luật/catalog staged có sẵn vào commit. Bộ kiểm duyệt tự động từ chối push vì cần người dùng xác nhận rõ đích egress `https://github.com/Sown-S/MedAssist.git`, nhánh `feature/knowledge-okf`. Chưa push và chưa tạo PR. Nội dung PR hoàn chỉnh nằm trong `PR_DESCRIPTION.md`, dự kiến vào develop; không merge/tự duyệt.
