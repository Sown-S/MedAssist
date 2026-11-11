153 bệnh còn lại sau khi gỡ 16 hồ sơ; 299 triệu chứng, 12 luật, 11 nguồn. Quan hệ Active staging 1.744 → 1.522; trích dẫn 172 → 156; bệnh thiếu then chốt 30 → 16. Nhóm bệnh: da liễu 58→56, TMH 43→36, cơ xương khớp 31→28, mắt 24→20, nhiễm trùng 11 và hô hấp 2 giữ nguyên.

**Chưa chốt lâm sàng để gửi giảng viên.** Cần bác sĩ rà: bao phủ an toàn đủ 11 bệnh (các mã chưa có luật bắt); 9 then chốt CHƯA RÀ LÂM SÀNG; 597 liên kết mơ hồ giữ nguyên; 2 ICD CẦN BÁC SĨ XÁC NHẬN. Hai bên đã rà v1.3: 106 ĐỒNG Ý, 5 CẦN SỬA, còn các lưu ý chuyên môn; giữ nguyên v1.3 và tách sửa nhãn sang v1.4. Quyết định của người giao việc chấp nhận tiếp tục sau cảnh báo điếc đột ngột không đại diện phê duyệt của bác sĩ.

## Thay đổi

- Gỡ 11 bệnh nặng và 5 hồ sơ triệu chứng; xóa 23 liên kết chéo, giữ catalog và logic luật. Danh sách/lý do: `evaluation/results/kb_2026_11_acceptance/removal_checks.json`, `cross_links.csv`.
- Bổ sung 9 then chốt từ liên kết SUPPORTS hiện có; mỗi bệnh 0 hoặc 1 then chốt, weight 0.9 chỉ dành cho then chốt. Còn 16 bệnh chưa chọn được đủ chắc; xem `key_symptoms.csv` và `conditions_without_key.json`.
- Sửa đúng hai ICD được giao M89.9→L40.5 và M89.0→M09.0; không đổi condition_code.
- Nâng nhãn KB-2026.11, đồng bộ snapshot manifest theo KB và review_basis theo phản hồi thực tế; các trường hash, files, retired_cases, clinical_statistics, benchmark_status và review_status không đổi. Combined SHA-256 vẫn `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`.
- Hai phiếu cuối và tổng hợp phản hồi Huy/Tuấn tại `evaluation/review/`. Luật/trích xuất và v1.4 là công việc riêng; không thêm/bớt nhãn hoặc KB để cải thiện điểm DDx.

## Card Trello

Chưa được cung cấp liên kết card.

## Kiểm tra

- [x] Chạy pytest toàn server: trước 1.388 passed, sau 1.388 passed. Không sửa mã/test server.
- [ ] Sửa Python ở server/tools: không áp dụng, không chạy ruff --fix.
- [ ] Có migration mới: không áp dụng; chỉ dùng Alembic hiện có để dựng staging.
- [ ] Sửa client: không áp dụng.
- [x] import_okf --dry-run không lỗi; báo cáo nguyên văn bên dưới.
- [x] Đã cập nhật tài liệu trong phạm vi knowledge/evaluation.
- [x] Không commit .env, mật khẩu, khóa riêng hoặc dữ liệu bệnh nhân thật.

Staging KB-2026.10 không có sẵn trong môi trường nên được dựng lại từ Alembic và kho trước sửa. Sao sang `medassist_kb202611_stage_20261111`, nạp với --retire-missing và tài khoản Physician kiểm thử riêng `kb_stage_physician_test`. Tài khoản chỉ mô phỏng kỹ thuật, không đại diện người thật hay phê duyệt lâm sàng. Active sau nạp khớp đĩa, 0 changes, 0 missing; xem `staging_acceptance.json`. Không truy cập CSDL nguồn medassist.

Pytest trước 250,43 giây, sau 227,93 giây. Seed demo đầy đủ catalog trên bản sao staging khác thành công; lần bỏ catalog trước đó lỗi cấp phát thuốc, giữ log và đã giải thích. Kiểm trực tiếp DEMO2-100/119/120 không vỡ nhưng dùng chẩn đoán văn bản thay liên kết condition Active; không coi là xác nhận an toàn.

RuleOnly đúng một lần, LLM_PROVIDER=none, skip-extraction: recall cờ đỏ 48/48, báo nhầm 0, ưu tiên 82/82, luật P/R/F1=1/1/1; DDx top-1=15/18, top-3=17/18, bằng đợt .10. Có 5 ca đổi thứ hạng; xem `rule_only/so_sanh_voi_KB-2026.10.md`. Chỉ 18 ca DDx phủ 27/153 bệnh; không đánh giá đủ toàn KB. Server lịch sử khác hiện tại nên không coi so sánh là cô lập duy nhất biến KB. Full/trích xuất chưa chạy; KB không đổi sau benchmark.

## Ngoài phạm vi / còn chờ

- Chủ server cần rà ba ca demo có condition_code bị gỡ, dù fallback không vỡ. Không sửa server/data/eval_cases.jsonl trong PR này.
- Chủ README/docs cần cập nhật các vị trí đề bài nêu: README.md:20, server/README.md:154, docs/huong-dan-kiem-thu.md:87, docs/huong-dan-demo-kiem-thu-ai.md:10.
- Phân loại tên triệu chứng và bệnh chủ là bảng hỗ trợ; các tên gộp/mơ hồ chưa được bác sĩ duyệt. Bảng an toàn gồm nhận xét Huy và phép kiểm kỹ thuật, không tự tuyên bố bệnh nhân điển hình đã được bảo vệ đủ.
- Chưa có phê duyệt bác sĩ cho then chốt/ICD/liên kết chờ; không sửa luật, không tạo v1.4, không merge/tag, không nạp CSDL đang chạy.
- Hai heading catalog/rf_out_of_scope có sẵn staged trước công việc được giữ ngoài commit/PR này.

## Dry-run nguyên văn

```
DATABASE_URL database=medassist_kb202611_stage_20261111
Thư mục: D:\DownLoad\MedAssist\knowledge
  299 triệu chứng, 153 bệnh, 1522 quan hệ, 156 trích dẫn, 12 luật, 11 nguồn
  symptom    mới   0  đổi   0  giữ nguyên 299
  condition  mới   0  đổi   2  giữ nguyên 151
  relation   mới   0  đổi   9  giữ nguyên 1513
  excerpt    mới   0  đổi   0  giữ nguyên 156
  rule       mới   0  đổi   0  giữ nguyên  12
  Đang Active nhưng không còn trong thư mục (254): condition:chong_mat, condition:diec_dot_ngot, condition:hoi_chung_bong_vay_da_do_tu_cau, condition:hoi_chung_dress, condition:khoi_u_vung_co, condition:ngat_mui, condition:roi_loan_giong, condition:tac_dong_mach_trung_tam_vong_mac, condition:u_tai, condition:viem_co_ap_xe_co_nhiem_khuan ...
--dry-run: không ghi gì.
```
