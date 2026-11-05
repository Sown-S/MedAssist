# Thiết kế backend: các luồng chính

Ghi chú thiết kế cho người sửa code trong `server/app/`. Docstring trong code chỉ tóm tắt và trỏ về mục tương ứng ở đây.
Lược đồ CSDL và ràng buộc: ERD (mục ghi trong ngoặc).

## 1. Nhật ký truy cập (`audit_service`, `core/audit_view`)

`audit_service.record()` là cửa vào duy nhất để thêm dòng `audit_log` (US09, FR09):

- Chỉ `db.add` + `flush`, không commit: dòng nhật ký nằm cùng transaction với thao tác nghiệp vụ, cùng thành công hoặc cùng rollback.
- Ngoại lệ: `LOGIN_FAILED`. Router đăng nhập phải commit dòng này dù đăng nhập thất bại.
- Chỉ lưu trường thay đổi (`diff_values`) và luôn che trường nhạy cảm.
- Không bao giờ UPDATE/DELETE: CSDL đã chặn bằng trigger và GRANT (ERD §2.21, §6.2).

`VIEW` và lượt bị từ chối ghi bằng session riêng, commit ngay (`record_now`), vì request GET không commit và request bị 403 không tới service.
Không ghi được nhật ký thì không cho truy cập dữ liệu bệnh nhân (fail closed).

`audit_view` là dependency gắn theo route, ghi `VIEW` cho mọi GET dữ liệu bệnh nhân (US04, US09):

```python
@router.get("/patients/{patient_id}")
def get_patient(patient_id: uuid.UUID,
                user: User = Depends(audit_view("patient", roles=CLINICAL_ROLES, id_param="patient_id"))):
    ...

# Endpoint polling (hàng đợi, trạng thái AI): gộp 1 dòng / người / đối tượng / 5 phút
Depends(audit_view("visit", roles=CLINICAL_ROLES, dedupe_seconds=300))
```

- Dòng `VIEW` được ghi trước khi handler chạy, nên có cả lượt xem không thành công (404).
- Sai vai trò: ghi lượt bị từ chối rồi trả 403.
- Bộ gộp `VIEW` của endpoint polling nằm trong bộ nhớ tiến trình. Nhiều tiến trình thì mỗi tiến trình có thể ghi trùng một dòng; chấp nhận được.

## 2. Hàng đợi AI và worker (`ai_queue_service`, `worker/runner`)

Hàng đợi là bảng `ai_assessment_log` (ERD §4.1), không dùng Redis hay Celery.

1. `enqueue_assessment()`: `POST /visits/{id}/assessment` gọi trong transaction của request.
   - Chụp đặc trưng đầu vào **đã xác nhận** (`visit_symptom` + sinh hiệu + tuổi) vào `input_features`.
   - Chạy Node 1 (cổng cờ đỏ) **đồng bộ**: cờ đỏ phải hiện ngay cả khi worker hay LLM đang dừng. Cờ đỏ thì lần chạy kết thúc luôn (`Skipped`/`RuleOnly`), không xếp hàng.
   - Không cờ đỏ: trạng thái `Queued`; các lần `Queued` cũ của cùng lượt khám bị thay thế.
2. Worker (`python -m app.worker`): `claim_next()` lấy việc bằng `FOR UPDATE SKIP LOCKED` + lease; `sweep_expired()` thu hồi lease quá hạn (worker chết giữa chừng).
3. Worker ghi gợi ý sơ bộ (`write_preliminary`) rồi kết quả cuối (`write_result`) hoặc lỗi (`write_failure`). Chỉ lần chạy **mới nhất** của lượt khám được cập nhật lượt khám.
4. Trích xuất triệu chứng (FR12): `enqueue_extraction()` xếp hàng `run_type = 'Extraction'`. Worker lấy trước Assessment (y tá đang chờ), ghi gợi ý bằng `write_extraction()`.
   Gợi ý chỉ nằm trong nhật ký AI; y tá xác nhận qua `PUT /visits/{id}/symptoms`. Không đổi `visit.ai_status`.

Ánh xạ trạng thái:

| Kết quả worker | `visit.ai_status` | `ai_assessment_log.status` |
| --- | --- | --- |
| Hoàn tất | `Ready` | `Completed` |
| Gợi ý sơ bộ | `Preliminary` | `Running` |
| Degraded, Skipped | giữ nguyên | giữ nguyên |
| Lỗi hạ tầng | `Failed` | `Failed` |

Ngân sách thời gian:

- Tính từ `queued_at`, gồm cả thời gian chờ trong hàng đợi: đánh giá tối đa `AI_ASSESSMENT_TIMEOUT_SECONDS` (90 s), trích xuất `feature_extractor.EXTRACTION_TIMEOUT_SECONDS` (30 s).
- Đánh giá quá hạn hoặc LLM lỗi: kết quả `Degraded`/`RuleOnly`. Trích xuất quá hạn hoặc LLM lỗi: danh sách rỗng. Chỉ lỗi hạ tầng mới `Failed`.
- Lease không cấp lại ngân sách đã hết.
- Mặc định 1 ca LLM: mỗi worker xử lý tuần tự từng việc.

Dữ liệu nhật ký AI:

- Không chứa thông tin định danh: `input_features` chỉ có mã triệu chứng, sinh hiệu, tuổi.
- `rule_hits` luôn có dạng `{"hits": [...], "complete_now": [{symptom_code, symptom_name}]}` ở cả lúc xếp hàng và lúc worker ghi kết quả, để polling không mất danh sách "cần bổ sung ngay".

## 3. Quyết định của bác sĩ với gợi ý AI (`ai_decision_service`)

Nối chẩn đoán của bác sĩ với lần chạy AI mà bác sĩ đã xem (FR02, ERD §2.13).
Nguồn gốc là `diagnosis.matches_top_suggestion`; `ai_assessment_log.physician_decision` là bản ghi kèm, luôn ghi trong **cùng** transaction với thay đổi chẩn đoán chính.
View `v_ai_decision_reconciliation` phải luôn rỗng.

| `matches_top_suggestion` | `physician_decision` |
| --- | --- |
| `TRUE` | `AcceptedTop` |
| `FALSE` | `ChoseOther` |
| `NULL` | `NoSuggestion` |

- Client gửi kèm `assessment_id` của kết quả đang hiển thị (không bắt buộc). Lần chạy phải thuộc đúng lượt khám và là `Assessment` (khóa ngoại kép `fk_diagnosis_assessment` cũng ép điều này).
- Không gửi: lấy lần chạy `Assessment` mới nhất mà bác sĩ đã có thể nhìn thấy kết quả.
- So sánh tại thời điểm xác nhận với gợi ý đứng đầu `candidates[0].condition_code`. Thứ hạng thay đổi sau đó (LLM xong muộn) không đổi quyết định đã ghi.
- `sync_decision()` gọi sau **mọi** thay đổi chẩn đoán chính (thêm, đổi chính, rút lại), trước commit: lần chạy của chẩn đoán chính đã xác nhận được ghi quyết định; các lần chạy còn lại (chẩn đoán phụ, đã rút lại) bị xóa quyết định cũ.

## 4. Lượt khám và hàng đợi (`queue_service`)

Máy trạng thái của `visit` (US10, FR10, ERD §2.10, §4):

```text
Waiting --check_in--> CheckedIn --start_exam--> Examining --mark_prescribed--> Prescribed --mark_finished--> Finished
                                                    |
                                     release (về CheckedIn)
```

- `Cancelled`: Nurse khi `Waiting`/`CheckedIn`; Physician khi `Examining` của chính mình; Nurse khi `Prescribed` nếu chưa cấp thuốc và chưa thu tiền (bệnh nhân bỏ về).
- Chuyển tuyến: `Finished` + `outcome = Referred`, từ `Examining` (Physician của lượt) hoặc `Waiting`/`CheckedIn` (Nurse); không qua `Prescribed`, không có hóa đơn (ERD §4.3).
- Mỗi lần chuyển là **một** câu UPDATE có điều kiện (`WHERE status = ...`): hai người bấm cùng lúc thì chỉ một người thắng, người kia nhận 409. Không cần khóa ở tầng ứng dụng.
- `mark_prescribed`, `mark_finished` là hàm nội bộ: service đơn thuốc và hóa đơn gọi trong cùng transaction với việc xác nhận đơn, thu tiền. Không có API gọi thẳng.
- Mọi lần chuyển ghi `audit_log` UPDATE (trạng thái cũ → mới) trong cùng transaction.

## 5. Kê đơn, kho, cấp phát, hóa đơn

### 5.1. Chẩn đoán và kê đơn (`prescription_service`, US02, US03)

```text
Examining -> chẩn đoán (lưu = xác nhận) -> đơn nháp (ghi đè được)
          -> XÁC NHẬN: chọn lô FEFO, trừ kho qua sổ cái, đơn Confirmed, lượt khám Prescribed, hóa đơn Pending
             (tất cả MỘT transaction)
```

- Không kê đơn: "Hoàn tất khám" → `Prescribed` + hóa đơn chỉ có phí khám.
- Mở lại đơn (chưa cấp thuốc, chưa thu tiền): hoàn kho, hủy đơn và hóa đơn, lượt khám về `Examining`.
- App không có quyền DELETE: sửa đơn nháp = hủy đơn nháp cũ + tạo đơn mới; rút chẩn đoán = `confirmed_by_physician = FALSE`.
- Nhật ký chỉ ghi tên trường, số lượng; không ghi tên bệnh hay tên thuốc (dữ liệu sức khỏe).

### 5.2. Kho thuốc (`inventory_service`, US05, ERD §5)

- Sổ cái `stock_movement` là nguồn sự thật: mọi thay đổi tồn là INSERT một dòng sổ cái; trigger `trg_stock_movement_apply` cộng vào lô.
  Không bao giờ UPDATE `inventory_batch.remaining_quantity` (`trg_inventory_batch_guard` chặn). Tồn âm bị CHECK chặn, cả transaction rollback.
- Không xóa thuốc, lô: ngừng dùng thuốc bằng `is_active = false`.
- Sổ cái đã có `performed_by`, thời điểm, lý do nên không ghi thêm `audit_log` cho từng biến động; `audit_log` ghi thay đổi danh mục thuốc và việc tạo lô.
- `allocate_fefo()`: hạn gần nhất trước, cùng hạn thì lô nhập trước. Khóa lô đủ điều kiện (`FOR UPDATE`) theo thứ tự `drug_id` → hạn → `batch_id` để hai đơn xác nhận cùng lúc không deadlock.
  Nhiều dòng cùng một thuốc được tính dồn trên cùng các lô. Trả `(phân bổ, thiếu)`: phân bổ = `[(item, batch_id, số lượng)]`, thiếu = `[{item_id, ..., reason}]`, rỗng nếu đủ hết.

### 5.3. Cấp phát và thu tiền (`billing_service`, US03, US06)

Nurse thao tác khi lượt khám ở `Prescribed`:

- Cấp phát từng dòng: `Dispensed`, hoặc `Skipped` (bắt buộc lý do) → hoàn kho đúng các lô đã trừ và lập lại hóa đơn `Pending` (bỏ dòng thuốc đó). Sau khi đã thu tiền: chỉ được `Dispensed`.
- Sửa hóa đơn `Pending` (phí khám, dòng cận lâm sàng nhập tay) = hủy và lập lại.
- Thu tiền: `Pending` → `Paid` (tiền mặt, chuyển khoản). `Paid` là trạng thái cuối.
- Lượt khám tự `Finished` khi hóa đơn `Paid` và không còn dòng thuốc `Pending` (đơn → `Dispensed`).
- Hủy lượt khám ở `Prescribed` (bệnh nhân bỏ về): chỉ khi chưa cấp thuốc nào, chưa thu tiền.

### 5.4. Hóa đơn (`invoice_service`, US06, ERD §2.19, §4.4)

- Tự tạo hóa đơn `Pending` khi lượt khám sang `Prescribed`; hủy khi mở lại đơn.
- Dòng cận lâm sàng lấy từ phiếu chỉ định còn hiệu lực; phí khám lấy từ danh mục dịch vụ.
- Bất biến do CSDL giữ: tổng tiền = 3 khoản phí; mỗi khoản phí = tổng các dòng cùng loại (constraint trigger, kiểm ở cuối transaction);
  dòng thuốc thuộc đơn của cùng lượt khám; tối đa một hóa đơn chưa hủy mỗi lượt.
- Không xóa dòng hóa đơn (app không có quyền DELETE): sửa = hủy hóa đơn rồi lập hóa đơn mới.

## 6. Tri thức lâm sàng

### 6.1. Quản trị tri thức (`knowledge_service`, US11, FR11, ERD §3)

Bản phát hành đi `Draft` → `PendingApproval` → `Active`.

- Chỉ Admin soạn; chỉ Physician (khác người soạn) duyệt, từ chối. Mỗi lúc tối đa **một** bản đang mở (`uq_release_single_open`).
- Soạn từng mục trong bản nháp đang mở: lần sửa đầu tạo dòng phiên bản mới (`version + 1`, `Draft`); sửa tiếp thì cập nhật chính dòng nháp đó. Phiên bản cũ luôn được giữ.
- Duyệt là **một** transaction (`activate_release`, dùng chung với `scripts/import_okf.py`): bản Active cũ của từng mã → `Retired (Superseded)`, bản mới → `Active`.
  Epoch tự tăng (trigger); trigger toàn vẹn kiểm tập Active khép kín lúc COMMIT (`commit_knowledge` đổi lỗi đó thành 409 dễ đọc).
- Tắt khẩn cấp (Admin, không cần duyệt): mục Active → `Retired (Deactivated)` kèm **tắt dây chuyền** các mục phụ thuộc trong cùng transaction;
  client phải gửi lại đúng danh sách phụ thuộc vừa xem trước. Bật lại = soạn phiên bản mới trong một bản phát hành và chờ duyệt.

### 6.2. Knowledge Reader (`knowledge_reader`, ERD §2.3b)

- Đọc `epoch` cùng **toàn bộ** dòng Active trong một snapshot (`REPEATABLE READ`), cache theo epoch.
- Đầu mỗi lần đánh giá chỉ cần một câu `SELECT epoch`; khác epoch đã cache thì nạp lại.
  Epoch đã commit luôn khớp dữ liệu đã commit, nên cách này đúng cho mọi tiến trình (api, worker) mà không cần tín hiệu invalidate: tắt khẩn cấp có hiệu lực ngay ở lần đánh giá kế tiếp của worker.
- Dữ liệu trả về là dict/list thuần (deep copy mỗi lần gọi), không phải model SQLAlchemy, đúng hợp đồng `app.ai.interfaces.KnowledgeReader` mà pipeline AI dùng.

### 6.3. Nạp tri thức OKF (`scripts/import_okf.py`)

Theo đặc tả `knowledge/_spec/okf_format.md`:

- Nhận diện file theo trường `schema`; tài liệu (`okf_spec_v1`, `okf_review_log_v1`) và thư mục `exports/` bị bỏ qua.
- Nguồn tra theo khóa tự nhiên (`organization`, `edition`); `source_key` chỉ dùng để liên kết trong thư mục.
- `condition_logic` kiểm theo đặc tả chung (`app.validation.knowledge_validators`) **và** chạy thử bằng chính bộ đánh giá của pipeline (`app.ai.rules.condition_evaluator`) để chắc chắn luật dùng được.
- Chỉ mục mới hoặc có nội dung khác bản Active mới tạo phiên bản mới (`version + 1`); mục không đổi giữ nguyên.
- Kích hoạt trong **một** transaction, dùng chung `activate_release` với API quản trị tri thức (§6.1).
- Mặc định người soạn là tài khoản `system` (`--as` để đổi); `--retire-missing` tắt mục đang Active mà không còn trong thư mục khi kích hoạt.

## 7. Giới hạn đăng nhập sai (`login_guard`)

Tính từ các dòng `LOGIN_FAILED` trong `audit_log`, không cần bảng mới. Cấu hình trong `.env`:

- Theo tên đăng nhập: `LOGIN_MAX_FAILURES_PER_USER` lần sai trong `LOGIN_WINDOW_MINUTES` phút (chỉ đếm sau lần đăng nhập thành công gần nhất) → khóa `LOGIN_LOCK_MINUTES` phút kể từ lần sai cuối.
- Theo IP: `LOGIN_MAX_FAILURES_PER_IP` lần (chặn dò nhiều tên khác nhau từ một máy).
- Lượt bị chặn vẫn ghi `LOGIN_FAILED` (reason `locked`) nhưng không được đếm, để thời gian khóa không bị kéo dài mãi.
- Admin mở khóa hoặc đặt lại mật khẩu thì chỉ đếm lần sai sau mốc đó (dòng `UPDATE users` trong `audit_log`).

## 8. Tra cứu nhanh bệnh nhân (`emr_service`, US04)

Một ô tìm kiếm cho quầy tiếp đón; hệ thống tự đoán người dùng gõ gì:

| Người dùng gõ | Hiểu là |
| --- | --- |
| `BN-3F2A9C1B`, `3f2a9c1b`, UUID đầy đủ | Mã bệnh nhân |
| 12 hoặc 9 chữ số | CCCD, CMND |
| 10 chữ số bắt đầu `0`, hoặc `+84...` | Số điện thoại |
| 4 chữ số (1890 đến năm nay) | Năm sinh |
| Chữ (năm sinh ở cuối, tùy chọn) | Họ tên không dấu (+ năm sinh) |

Dòng `CREATE`/`UPDATE` của bệnh nhân trong nhật ký chỉ ghi tên trường thay đổi, không ghi giá trị: Admin xem được `audit_log` nhưng không được xem dữ liệu bệnh nhân (tối thiểu hóa, Nghị định 13).
