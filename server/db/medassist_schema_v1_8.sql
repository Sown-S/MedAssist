-- =====================================================================
-- MedAssist (CDSS for Outpatient Clinics) — Database Schema v1.8
-- Target: PostgreSQL 16 trong Docker Compose | Database: medassist | Schema: public
-- Sinh từ: ERD_MedAssist_v1_8.md. Nền: medassist_schema_v1_7.sql (sửa có đối chiếu, không viết lại).
--
-- CÁCH CHẠY: KHÔNG chạy tay. Revision Alembic 0001_initial_schema_v1_8 thực thi file này
-- bằng vai trò medassist_owner trên database MỚI. Database đã dựng bằng v1.7 thì KHÔNG chạy
-- file này mà chạy revision 0002 (medassist_migration_v1_7_to_v1_8.sql). Vai trò, owner
-- database, múi giờ và quyền CONNECT do server/db/initdb/ tạo sẵn lúc khởi tạo container.
--
-- Thay đổi so với v1.7 (chi tiết ở ERD v1.8, mục "Điểm mới so với v1.7"):
--   [THÊM] symptom_key, condition_key: bảng định danh mã OKF. Mọi tham chiếu bằng mã ổn định
--         (condition_symptom, guideline_excerpt, diagnosis) nay có khóa ngoại thật; mã gõ sai
--         bị chặn ngay khi nạp. Trigger tự đăng ký mã khi INSERT symptom/condition.
--   [THÊM] v_knowledge_integrity_issues + constraint trigger hoãn đến COMMIT: tập Active phải
--         khép kín (quan hệ, khuyến cáo, luật chỉ trỏ tới mã còn Active; luật chỉ dùng khóa
--         sinh hiệu chuẩn). Tắt một triệu chứng/bệnh phải tắt luôn mục phụ thuộc cùng transaction.
--   [THÊM] knowledge_epoch: số hiệu tri thức, tăng trong CÙNG transaction với mọi thay đổi
--         bảng tri thức; cache Knowledge Reader ở mọi tiến trình (api, worker) so epoch.
--   [ĐỔI] ai_assessment_log làm hàng đợi công việc bền vững: trạng thái Queued, queued_at,
--         lease_until, attempt_count; started_at chỉ có khi Running. Worker lấy việc bằng
--         FOR UPDATE SKIP LOCKED; sweeper thu hồi lease quá hạn.
--   [ĐỔI] visit.ai_status thêm Preliminary (đã có kết quả Node 2 tất định, LLM chưa xong).
--   [THÊM] CHECK khóa sinh hiệu chuẩn cho visit.vital_signs (fn_vital_sign_keys()).
--   [THÊM] Tìm bệnh nhân không dấu: unaccent + pg_trgm, f_unaccent(); chỉ mục số điện thoại.
--   [ĐỔI] idx_visit_patient -> (patient_id, visit_date DESC); thêm idx_invoice_paid_at.
--   [THÊM] Constraint trigger hoãn: 3 khoản phí của invoice = tổng invoice_item cùng loại.
--   [THÊM] v_ai_decision_reconciliation: physician_decision phải khớp diagnosis (nguồn gốc).
--   [ĐỔI] audit_log ghi được đăng nhập thất bại: LOGIN_FAILED, attempted_username, user_id NULL
--         chỉ với LOGIN_FAILED (đóng ERD điểm mở #1).
--
-- Thay đổi của v1.7 so với v1.6 (giữ lại để tra cứu):
--   [SỬA] Thiếu ALTER DEFAULT PRIVILEGES: bảng do Alembic tạo sau này không cấp quyền
--         cho medassist_app (API sẽ báo permission denied ở migration kế tiếp).
--   [SỬA] chk_visit_red_flag_emergency dính bẫy NULL (cờ đỏ + triage_priority NULL vẫn ghi
--         được); nay là tương đương hai chiều: cờ đỏ <=> Emergency, ở cả mức luật lẫn mức
--         hiện hành. Vì vậy Emergency CHỈ có thể đến từ luật RED_FLAG (US01, nguyên tắc 8).
--   [SỬA] chk_visit_ai_raise_scope dính bẫy NULL (AI "nâng" khi mức luật còn NULL).
--   [SỬA] chk_visit_priority_never_lowered: đã có mức luật thì bắt buộc có mức hiện hành.
--   [SỬA] Trigger kho báo sai lỗi "lô không thuộc thuốc" khi dòng đơn/lô không tồn tại;
--         nay nhường cho khóa ngoại báo đúng lỗi 23503.
--   [SỬA] audit_log: TRUNCATE lách được trigger dòng -> thêm trigger mức câu lệnh;
--         SQLSTATE thống nhất 23514 (check_violation) cho cả 3 trigger.
--   [ĐỔI] rule_key, excerpt_key: UUID -> VARCHAR(80) dạng slug (đóng ERD điểm mở #11);
--         CHECK định dạng slug cho mọi mã OKF; rule_key có tiền tố rf_ / pf_ theo rule_type.
--   [ĐỔI] Tách phần hạ tầng (tạo vai trò, đổi owner, múi giờ DB) sang server/db/initdb/.
--   [THÊM] View chỉ được SELECT; bảng alembic_version không cho medassist_app ghi.
--   [VÁ 02/10] Toàn vẹn chéo bảng (sửa tại chỗ, v1.7 chưa triển khai):
--         (1) remaining_quantity tự khớp sổ cái: trigger trg_stock_movement_apply cập nhật lô;
--             trg_inventory_batch_guard chặn sửa tay remaining/initial; view đối soát.
--         (2) diagnosis chỉ gắn lần chạy Assessment CỦA CHÍNH lượt khám đó (FK kép 3 cột).
--         (3) visit_symptom.symptom_code phải khớp symptom_id (FK kép).
--         (4) visit.red_flag_rule_id phải là luật RED_FLAG (FK kép với cột sinh tự động).
--         (5) invoice_item.prescription_item_id phải thuộc đơn của cùng lượt khám (trigger).
-- Số đếm v1.8: 25 bảng | 5 view | 20 trigger (13 thường + 7 constraint trigger hoãn) | 33 CHECK nghiệp vụ
-- đặt tên (91 CHECK tất cả) | 22 chỉ mục duy nhất đặt tên (85 chỉ mục tất cả) | 9 khóa ngoại đặt tên — ERD v1.8 mục 6.
-- =====================================================================

-- Chốt chặn: đối tượng phải thuộc medassist_owner, nếu không ALTER DEFAULT PRIVILEGES ở
-- cuối file sẽ gắn vào sai vai trò và các migration sau sẽ mất quyền.
DO $$ BEGIN
    IF current_user <> 'medassist_owner' THEN
        RAISE EXCEPTION 'Phải chạy bằng medassist_owner (đang là %). Dùng MIGRATION_DATABASE_URL.', current_user
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END $$;

-- gen_random_uuid() có sẵn từ PostgreSQL 13, không cần extension pgcrypto.

-- v1.8: tìm bệnh nhân theo tên không dấu. Hai extension này là "trusted" (PostgreSQL 13+),
-- owner của database tạo được mà không cần superuser.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA public;

-- unaccent() chỉ là STABLE (phụ thuộc từ điển) nên không dùng thẳng trong chỉ mục được;
-- bọc lại với từ điển ghi rõ để có hàm IMMUTABLE. Ứng dụng tìm bằng đúng biểu thức của chỉ mục:
--   WHERE lower(f_unaccent(full_name)) LIKE '%' || lower(f_unaccent(:q)) || '%'
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- v1.8: danh sách khóa sinh hiệu chuẩn — NGUỒN DUY NHẤT trong CSDL, dùng cho CHECK của
-- visit.vital_signs và cho kiểm tra luật trong v_knowledge_integrity_issues. File JSON Schema
-- server/app/validation/schemas/vital_signs.schema.json phải liệt kê đúng các khóa này
-- (có kiểm thử so khớp). Thêm khóa = migration thay hàm này + sửa JSON Schema cùng PR.
CREATE OR REPLACE FUNCTION fn_vital_sign_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT ARRAY['temperature_c','heart_rate_bpm','respiratory_rate_bpm',
                       'systolic_bp_mmhg','diastolic_bp_mmhg','spo2_pct',
                       'weight_kg','height_cm']::text[] $$;

-- =====================================================================
-- 1. USERS  (3 role: Physician | Nurse (Y tá/Lễ tân) | Admin)
-- =====================================================================
CREATE TABLE users (
    user_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username       VARCHAR(50) UNIQUE NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    full_name      VARCHAR(100) NOT NULL,
    role           VARCHAR(20) NOT NULL CHECK (role IN ('Physician','Nurse','Admin')),
    email          VARCHAR(100),
    phone          VARCHAR(20),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Script (seed, nạp OKF) ghi audit_log bằng tài khoản 'system' (role Admin, is_active = FALSE,
-- không đăng nhập được); tài khoản này được tạo trong server/db/03_bootstrap.sql.

-- =====================================================================
-- 1b. SYSTEM_SETTING  (tham số vận hành do Admin chỉnh, có audit; kiểm tra kiểu ở lớp validation)
--     inventory.near_expiry_days (90) | inventory.min_remaining_shelf_days (0)
--     clinic.profile ({name,address,phone}) | billing.default_consultation_fee (0)
--     Giá trị mặc định nạp bằng script seed; view kho tự dùng 90 nếu chưa có.
-- =====================================================================
CREATE TABLE system_setting (
    setting_key  VARCHAR(100) PRIMARY KEY,               -- tiền tố theo module, vd inventory.*
    value        JSONB NOT NULL,
    description  TEXT,
    updated_by   UUID NOT NULL REFERENCES users(user_id),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 2. KNOWLEDGE_SOURCE  (nguồn WHO / Bộ Y tế cho từng mục tri thức)
-- =====================================================================
CREATE TABLE knowledge_source (
    source_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title             VARCHAR(255) NOT NULL,
    organization      VARCHAR(100) NOT NULL,          -- 'WHO', 'Bộ Y tế', ...
    publication_date  DATE,
    edition           VARCHAR(50),
    url               TEXT,
    accessed_date     DATE,
    license_note      TEXT,                           -- vd: điều khoản sử dụng tài liệu
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_by        UUID NOT NULL REFERENCES users(user_id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 3. KNOWLEDGE_RELEASE  (bản phát hành tri thức — đơn vị để Bác sĩ duyệt)
--    Draft -> PendingApproval -> Active. Từ chối: quay về Draft kèm review_note.
--    Chỉ có tối đa 1 bản đang mở (Draft/PendingApproval) tại một thời điểm.
-- =====================================================================
CREATE TABLE knowledge_release (
    release_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label          VARCHAR(30) UNIQUE NOT NULL,       -- vd: KB-2026.01
    description    TEXT,
    status         VARCHAR(20) NOT NULL DEFAULT 'Draft'
                      CHECK (status IN ('Draft','PendingApproval','Active')),
    created_by     UUID NOT NULL REFERENCES users(user_id),   -- Admin soạn
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at   TIMESTAMPTZ,
    approved_by    UUID REFERENCES users(user_id),            -- Physician duyệt
    approved_at    TIMESTAMPTZ,
    review_note    TEXT,
    CONSTRAINT chk_release_approver_not_author
        CHECK (approved_by IS NULL OR approved_by <> created_by),
    CONSTRAINT chk_release_active_approved
        CHECK (status <> 'Active' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_release_single_open
    ON knowledge_release ((TRUE)) WHERE status IN ('Draft','PendingApproval');

-- =====================================================================
-- 3b. SYMPTOM_KEY, CONDITION_KEY  (v1.8: định danh mã OKF, tách khỏi phiên bản)
--     Mỗi mã ổn định có đúng một dòng, không bao giờ xóa hay đổi (app không có UPDATE/DELETE).
--     Các dòng phiên bản và mọi bảng tham chiếu bằng mã đều có khóa ngoại tới đây, nên khóa
--     ngoại không gãy khi lên phiên bản, còn mã gõ sai thì bị chặn ngay (23503).
--     Dòng được đăng ký tự động khi INSERT symptom/condition (trigger 6), nên script nạp phải
--     nạp triệu chứng và bệnh TRƯỚC quan hệ, khuyến cáo trong cùng transaction.
--     "Mã có tồn tại" do khóa ngoại ép; "mã còn Active" do v_knowledge_integrity_issues ép lúc COMMIT.
-- =====================================================================
CREATE TABLE symptom_key (
    symptom_code  VARCHAR(50) PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_symptom_key_format CHECK (symptom_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);

CREATE TABLE condition_key (
    condition_code  VARCHAR(80) PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_condition_key_format CHECK (condition_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);

-- =====================================================================
-- 3c. KNOWLEDGE_EPOCH  (v1.8: số hiệu tri thức, một dòng duy nhất)
--     Tăng bằng trigger trong CÙNG transaction với mọi INSERT/UPDATE trên 5 bảng tri thức
--     (trigger 7), nên giá trị đã commit luôn khớp dữ liệu đã commit. Knowledge Reader đọc
--     epoch + toàn bộ dòng Active trong MỘT snapshot (REPEATABLE READ) rồi cache theo epoch;
--     đầu mỗi lần đánh giá so epoch (1 câu SELECT) và nạp lại nếu khác. Đúng cho mọi tiến
--     trình (api, worker) mà không cần gửi tín hiệu invalidate.
--     Không dùng SEQUENCE: nextval không theo transaction, reader có thể thấy epoch mới
--     trước khi dữ liệu mới commit rồi cache nhầm dữ liệu cũ dưới epoch mới.
-- =====================================================================
CREATE TABLE knowledge_epoch (
    singleton   BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    epoch       BIGINT NOT NULL DEFAULT 0 CHECK (epoch >= 0),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO knowledge_epoch (singleton) VALUES (TRUE);

-- =====================================================================
-- 4. SYMPTOM  (danh mục triệu chứng chuẩn hoá; mỗi phiên bản một dòng)
-- =====================================================================
CREATE TABLE symptom (
    symptom_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symptom_code    VARCHAR(50) NOT NULL,             -- mã ổn định, không đổi giữa các phiên bản
    version         INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    symptom_name    VARCHAR(150) NOT NULL,            -- tên hiển thị tiếng Việt
    category        VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft','PendingApproval','Active','Retired')),
    release_id      UUID NOT NULL REFERENCES knowledge_release(release_id),
    created_by      UUID NOT NULL REFERENCES users(user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_by      UUID REFERENCES users(user_id),
    retired_at      TIMESTAMPTZ,
    retired_reason  VARCHAR(20) CHECK (retired_reason IN ('Superseded','Deactivated')),
    CONSTRAINT uq_symptom_code_version UNIQUE (symptom_code, version),
    CONSTRAINT uq_symptom_id_code UNIQUE (symptom_id, symptom_code),   -- đích của FK kép từ visit_symptom
    CONSTRAINT fk_symptom_key FOREIGN KEY (symptom_code) REFERENCES symptom_key(symptom_code),
    CONSTRAINT chk_symptom_code_format CHECK (symptom_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX uq_symptom_active ON symptom(symptom_code) WHERE status = 'Active';

-- =====================================================================
-- 5. CONDITION  (danh sách bệnh hợp lệ — "danh sách trắng" cho Node 2/3/4)
-- =====================================================================
CREATE TABLE condition (
    condition_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condition_code  VARCHAR(80) NOT NULL,             -- slug ổn định
    version         INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    name_vi         VARCHAR(200) NOT NULL,
    icd10_code      VARCHAR(10),
    disease_group   VARCHAR(100),                     -- nhóm bệnh (dùng để gán nhãn chéo, thống kê)
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft','PendingApproval','Active','Retired')),
    release_id      UUID NOT NULL REFERENCES knowledge_release(release_id),
    created_by      UUID NOT NULL REFERENCES users(user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_by      UUID REFERENCES users(user_id),
    retired_at      TIMESTAMPTZ,
    retired_reason  VARCHAR(20) CHECK (retired_reason IN ('Superseded','Deactivated')),
    CONSTRAINT uq_condition_code_version UNIQUE (condition_code, version),
    CONSTRAINT fk_condition_key FOREIGN KEY (condition_code) REFERENCES condition_key(condition_code),
    CONSTRAINT chk_condition_code_format CHECK (condition_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX uq_condition_active ON condition(condition_code) WHERE status = 'Active';

-- =====================================================================
-- 6. CONDITION_SYMPTOM  (quan hệ triệu chứng - bệnh có trọng số; đồ thị tri thức của Node 2)
--    Tham chiếu bằng MÃ ỔN ĐỊNH (condition_code, symptom_code); v1.8: khóa ngoại tới bảng định danh.
-- =====================================================================
CREATE TABLE condition_symptom (
    relation_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condition_code  VARCHAR(80) NOT NULL,
    symptom_code    VARCHAR(50) NOT NULL,
    polarity        VARCHAR(12) NOT NULL CHECK (polarity IN ('SUPPORTS','CONTRADICTS')),
    weight          DECIMAL(3,2) NOT NULL CHECK (weight BETWEEN 0 AND 1),
    is_key          BOOLEAN NOT NULL DEFAULT FALSE,   -- triệu chứng then chốt (nhắc thông tin còn thiếu)
    source_id       UUID NOT NULL REFERENCES knowledge_source(source_id),
    version         INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    status          VARCHAR(20) NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft','PendingApproval','Active','Retired')),
    release_id      UUID NOT NULL REFERENCES knowledge_release(release_id),
    created_by      UUID NOT NULL REFERENCES users(user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_by      UUID REFERENCES users(user_id),
    retired_at      TIMESTAMPTZ,
    retired_reason  VARCHAR(20) CHECK (retired_reason IN ('Superseded','Deactivated')),
    CONSTRAINT uq_condition_symptom_version UNIQUE (condition_code, symptom_code, version),
    CONSTRAINT fk_condition_symptom_condition FOREIGN KEY (condition_code) REFERENCES condition_key(condition_code),
    CONSTRAINT fk_condition_symptom_symptom   FOREIGN KEY (symptom_code)   REFERENCES symptom_key(symptom_code),
    CONSTRAINT chk_condition_symptom_code_format
        CHECK (condition_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$' AND symptom_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX uq_condition_symptom_active
    ON condition_symptom(condition_code, symptom_code) WHERE status = 'Active';

-- =====================================================================
-- 7. GUIDELINE_EXCERPT  (đoạn khuyến cáo có dẫn nguồn, đưa vào ngữ cảnh đóng của LLM)
-- =====================================================================
CREATE TABLE guideline_excerpt (
    excerpt_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    excerpt_key     VARCHAR(80) NOT NULL,             -- slug ổn định, vd viem_phoi_dieu_tri_ngoai_tru
    condition_code  VARCHAR(80) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    content         TEXT NOT NULL,                    -- diễn đạt lại, không chép nguyên văn dài
    source_id       UUID NOT NULL REFERENCES knowledge_source(source_id),
    source_locator  VARCHAR(100),                     -- mục/trang trong tài liệu nguồn
    version         INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    status          VARCHAR(20) NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft','PendingApproval','Active','Retired')),
    release_id      UUID NOT NULL REFERENCES knowledge_release(release_id),
    created_by      UUID NOT NULL REFERENCES users(user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_by      UUID REFERENCES users(user_id),
    retired_at      TIMESTAMPTZ,
    retired_reason  VARCHAR(20) CHECK (retired_reason IN ('Superseded','Deactivated')),
    CONSTRAINT uq_excerpt_key_version UNIQUE (excerpt_key, version),
    CONSTRAINT fk_excerpt_condition FOREIGN KEY (condition_code) REFERENCES condition_key(condition_code),
    CONSTRAINT chk_guideline_excerpt_code_format
        CHECK (excerpt_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$' AND condition_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX uq_excerpt_active ON guideline_excerpt(excerpt_key) WHERE status = 'Active';

-- =====================================================================
-- 8. TRIAGE_RULE  (chỉ còn LUẬT AN TOÀN: RED_FLAG hoặc PRIORITY_FLOOR)
--    RED_FLAG      -> Emergency, dừng pipeline AI (không gọi LLM)
--    PRIORITY_FLOOR-> mức sàn HighPriority, vẫn chạy AI
--    Triệu chứng ngoài danh mục: mã triệu chứng hệ thống (vd out_of_scope_symptom) + 1 luật RED_FLAG
-- =====================================================================
CREATE TABLE triage_rule (
    triage_rule_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_key           VARCHAR(80) NOT NULL,          -- slug ổn định: rf_* (RED_FLAG) / pf_* (PRIORITY_FLOOR)
    version            INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    rule_name          VARCHAR(255) NOT NULL,
    rule_type          VARCHAR(20) NOT NULL CHECK (rule_type IN ('RED_FLAG','PRIORITY_FLOOR')),
    condition_logic    JSONB NOT NULL,                -- cây AND/OR; lá dùng khóa symptom_code (+ state) và vital (khóa chuẩn)
    resulting_priority VARCHAR(20) NOT NULL CHECK (resulting_priority IN ('Emergency','HighPriority')),
    reason_text        TEXT NOT NULL,                 -- lý do hiển thị cho bác sĩ (red_flag_reason)
    source_id          UUID NOT NULL REFERENCES knowledge_source(source_id),
    status             VARCHAR(20) NOT NULL DEFAULT 'Draft'
                          CHECK (status IN ('Draft','PendingApproval','Active','Retired')),
    release_id         UUID NOT NULL REFERENCES knowledge_release(release_id),
    created_by         UUID NOT NULL REFERENCES users(user_id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_by         UUID REFERENCES users(user_id),
    retired_at         TIMESTAMPTZ,
    retired_reason     VARCHAR(20) CHECK (retired_reason IN ('Superseded','Deactivated')),
    CONSTRAINT uq_triage_rule_key_version UNIQUE (rule_key, version),
    CONSTRAINT uq_triage_rule_id_type UNIQUE (triage_rule_id, rule_type),   -- đích của FK kép từ visit
    CONSTRAINT chk_triage_rule_type_priority CHECK (
        (rule_type = 'RED_FLAG'       AND resulting_priority = 'Emergency') OR
        (rule_type = 'PRIORITY_FLOOR' AND resulting_priority = 'HighPriority')
    ),
    -- slug + tiền tố theo loại luật: đọc rule_hits trong nhật ký AI là biết ngay loại luật
    CONSTRAINT chk_triage_rule_key_format CHECK (
        rule_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$' AND (
            (rule_type = 'RED_FLAG'       AND rule_key ~ '^rf_') OR
            (rule_type = 'PRIORITY_FLOOR' AND rule_key ~ '^pf_'))
    )
);
CREATE UNIQUE INDEX uq_triage_rule_active ON triage_rule(rule_key) WHERE status = 'Active';

-- =====================================================================
-- 9. PATIENT
-- =====================================================================
CREATE TABLE patient (
    patient_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_number       VARCHAR(20),
    full_name       VARCHAR(100) NOT NULL,
    date_of_birth   DATE NOT NULL,
    gender          VARCHAR(10) NOT NULL CHECK (gender IN ('Male','Female','Other')),
    phone           VARCHAR(20),
    address         VARCHAR(255),
    medical_history JSONB,                            -- bệnh nền, thai kỳ (khung nhắc chỉ đọc khi kê đơn)
    allergy_notes   TEXT,                             -- dị ứng (khung nhắc chỉ đọc khi kê đơn)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- số định danh không trùng khi có giá trị (tránh tạo trùng hồ sơ)
CREATE UNIQUE INDEX uq_patient_id_number ON patient(id_number) WHERE id_number IS NOT NULL;
-- v1.8: chỉ mục tìm theo tên không dấu và số điện thoại nằm ở mục INDEXES.

-- =====================================================================
-- 10. VISIT  (lượt khám; hàng đợi chính là danh sách visit đang chờ)
-- =====================================================================
CREATE TABLE visit (
    visit_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id             UUID NOT NULL REFERENCES patient(patient_id),
    nurse_id               UUID NOT NULL REFERENCES users(user_id),
    physician_id              UUID REFERENCES users(user_id),       -- bác sĩ nhận khám (gán có điều kiện khi Examining)
    visit_date             TIMESTAMPTZ NOT NULL DEFAULT now(),   -- thời điểm vào hàng đợi (dùng cho FIFO)
    queue_date             DATE NOT NULL DEFAULT CURRENT_DATE,   -- ngày của hàng đợi (múi giờ DB)
    status                 VARCHAR(20) NOT NULL DEFAULT 'Waiting'
                              CHECK (status IN ('Waiting','CheckedIn','Examining','Prescribed','Finished','Cancelled')),
    queue_number           INT CHECK (queue_number > 0),         -- số thứ tự trong ngày
    checked_in_at          TIMESTAMPTZ,                          -- lúc đến lượt và y tá check-in
    vital_signs            JSONB,                                -- chỉ khóa chuẩn, giá trị số (chk_visit_vital_signs_keys)
    chief_complaint        TEXT NOT NULL,
    free_text_description  TEXT,                                 -- mô tả tự do của y tá (FR12)
    triage_priority_rule   VARCHAR(20) CHECK (triage_priority_rule IN ('Emergency','HighPriority','Routine')),
    triage_priority        VARCHAR(20) CHECK (triage_priority IN ('Emergency','HighPriority','Routine')),
    priority_raised_by_ai  BOOLEAN NOT NULL DEFAULT FALSE,
    ai_status              VARCHAR(20) NOT NULL DEFAULT 'Pending'
                              CHECK (ai_status IN ('Pending','Preliminary','Ready','Degraded','Failed','Skipped')),
                              -- v1.8: Preliminary = đã có xếp hạng tất định Node 2, LLM chưa xong
    is_red_flag            BOOLEAN NOT NULL DEFAULT FALSE,
    red_flag_reason        TEXT,
    red_flag_rule_id       UUID,
    -- cột sinh tự động: hằng 'RED_FLAG' khi có luật, để FK kép buộc luật đã khớp là RED_FLAG
    red_flag_rule_type     VARCHAR(20) GENERATED ALWAYS AS
                              (CASE WHEN red_flag_rule_id IS NULL THEN NULL ELSE 'RED_FLAG' END) STORED,
    exam_started_at        TIMESTAMPTZ,
    finished_at            TIMESTAMPTZ,                          -- lúc Finished hoặc Cancelled
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- LƯU Ý BẪY NULL: CHECK trả NULL được coi là ĐẠT. Ba ràng buộc dưới đây viết bằng
    -- COALESCE / IS NOT DISTINCT FROM để không bao giờ trả NULL (v1.6 dính lỗi này).
    --
    -- AI chỉ được nâng, không được hạ mức do luật đặt; đã có mức luật thì phải có mức hiện hành
    CONSTRAINT chk_visit_priority_never_lowered CHECK (
        COALESCE(CASE triage_priority      WHEN 'Emergency' THEN 3 WHEN 'HighPriority' THEN 2 WHEN 'Routine' THEN 1 END, 0)
        >= COALESCE(CASE triage_priority_rule WHEN 'Emergency' THEN 3 WHEN 'HighPriority' THEN 2 WHEN 'Routine' THEN 1 END, 0)
    ),
    -- AI chỉ được nâng Routine -> HighPriority
    CONSTRAINT chk_visit_ai_raise_scope CHECK (
        NOT priority_raised_by_ai OR
        (triage_priority_rule IS NOT DISTINCT FROM 'Routine' AND triage_priority IS NOT DISTINCT FROM 'HighPriority')
    ),
    -- Cờ đỏ <=> Emergency, ở CẢ mức luật lẫn mức hiện hành. Hệ quả: Emergency chỉ có thể
    -- đến từ luật RED_FLAG, không ai (kể cả code nối nhầm đầu ra LLM) gán được Emergency.
    -- Node 1 phải ghi is_red_flag, red_flag_rule_id, red_flag_reason, triage_priority_rule
    -- và triage_priority trong CÙNG MỘT câu lệnh.
    CONSTRAINT chk_visit_red_flag_emergency CHECK (
        is_red_flag = (triage_priority      IS NOT DISTINCT FROM 'Emergency') AND
        is_red_flag = (triage_priority_rule IS NOT DISTINCT FROM 'Emergency')
    ),
    -- Cờ đỏ phải có luật đã khớp và lý do (truy vết FR08, NFR09)
    CONSTRAINT chk_visit_red_flag_rule CHECK (
        is_red_flag = FALSE OR (red_flag_rule_id IS NOT NULL AND red_flag_reason IS NOT NULL)
    ),
    CONSTRAINT fk_visit_red_flag_rule FOREIGN KEY (red_flag_rule_id, red_flag_rule_type)
        REFERENCES triage_rule(triage_rule_id, rule_type),
    -- v1.8: khóa sinh hiệu là tập con của khóa chuẩn và giá trị là số. Một khóa gõ sai (vd 'spo2')
    -- sẽ khiến luật cờ đỏ dùng 'spo2_pct' không bao giờ khớp, nên chặn ngay từ lúc ghi.
    -- Khoảng giá trị hợp lý (vd 30 <= temperature_c <= 45) kiểm ở lớp validation.
    CONSTRAINT chk_visit_vital_signs_keys CHECK (
        vital_signs IS NULL OR (
            jsonb_typeof(vital_signs) = 'object'
            AND (vital_signs - fn_vital_sign_keys()) = '{}'::jsonb
            AND NOT jsonb_path_exists(vital_signs, '$.* ? (@.type() != "number")')
        )
    )
);
-- không trùng số thứ tự trong cùng một ngày (chốt chặn khi 2 máy y tá cấp số cùng lúc)
CREATE UNIQUE INDEX uq_visit_queue_number ON visit(queue_date, queue_number) WHERE queue_number IS NOT NULL;

-- =====================================================================
-- 11. VISIT_SYMPTOM  (triệu chứng tri-state đã được y tá xác nhận)
-- =====================================================================
CREATE TABLE visit_symptom (
    visit_symptom_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id          UUID NOT NULL REFERENCES visit(visit_id),
    symptom_code      VARCHAR(50) NOT NULL,             -- chép từ symptom lúc lưu; khớp symptom_id nhờ FK kép
    symptom_id        UUID NOT NULL,                    -- đúng dòng phiên bản đã dùng (FK kép bên dưới)
    state             VARCHAR(10) NOT NULL CHECK (state IN ('PRESENT','ABSENT','UNKNOWN')),
    source            VARCHAR(20) NOT NULL DEFAULT 'Form' CHECK (source IN ('Form','Extracted','Prompt')),
    confirmed_by      UUID NOT NULL REFERENCES users(user_id),
    confirmed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_visit_symptom UNIQUE (visit_id, symptom_code),  -- 1 trạng thái / mã / lượt khám
    CONSTRAINT fk_visit_symptom_symptom FOREIGN KEY (symptom_id, symptom_code)
        REFERENCES symptom(symptom_id, symptom_code),
    CONSTRAINT chk_visit_symptom_code_format CHECK (symptom_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);

-- =====================================================================
-- 12. AI_ASSESSMENT_LOG  (nhật ký mỗi lần chạy AI: trích xuất hoặc đánh giá)
--     Không lưu nguyên văn prompt, chỉ lưu prompt_version.
--     v1.8: đồng thời là HÀNG ĐỢI CÔNG VIỆC bền vững cho worker AI.
--       Queued -> Running (worker lấy bằng FOR UPDATE SKIP LOCKED, đặt lease_until)
--              -> Completed | Degraded | Failed
--       Skipped: ghi thẳng khi cờ đỏ dừng pipeline (không qua hàng đợi).
--       Sweeper (khi worker khởi động và định kỳ): dòng Running có lease_until < now() thì
--       xếp lại Queued nếu attempt_count < 2, ngược lại ghi kết quả Rule-only (Degraded)
--       hoặc Failed. Số worker = số ca LLM đồng thời (mặc định 1).
--       Kết quả lũy tiến: worker ghi candidates của Node 2 với mode = RuleOnly ngay khi có
--       (visit.ai_status = Preliminary), rồi nâng lên Full khi LLM qua Node 4.
-- =====================================================================
CREATE TABLE ai_assessment_log (
    assessment_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id              UUID NOT NULL REFERENCES visit(visit_id),
    run_type              VARCHAR(20) NOT NULL CHECK (run_type IN ('Extraction','Assessment')),
    triggered_by          UUID REFERENCES users(user_id),
    status                VARCHAR(20) NOT NULL DEFAULT 'Queued'
                             CHECK (status IN ('Queued','Running','Completed','Degraded','Failed','Skipped')),
    mode                  VARCHAR(20) CHECK (mode IN ('Full','RuleOnly')),
    input_features        JSONB,             -- đặc trưng đã xác nhận, KHÔNG có thông tin định danh
    rule_hits             JSONB,             -- rule_key + version đã khớp (Node 1)
    priority_rule         VARCHAR(20) CHECK (priority_rule  IN ('Emergency','HighPriority','Routine')),
    priority_final        VARCHAR(20) CHECK (priority_final IN ('Emergency','HighPriority','Routine')),
    candidates            JSONB,             -- ứng viên (Node 2), bằng chứng ủng hộ/mâu thuẫn/thiếu, điểm khớp, kết quả xếp hạng
    llm_output_raw        TEXT,
    validation_result     JSONB,             -- kết quả Node 4: pass/fail từng kiểm tra + lý do
    error_detail          TEXT,              -- mã/lý do khi Degraded/Failed (vd LLM_TIMEOUT), không chứa dữ liệu bệnh nhân
    knowledge_release_id  UUID REFERENCES knowledge_release(release_id),
    model_name            VARCHAR(100),
    model_version         VARCHAR(50),
    prompt_version        VARCHAR(50),
    latency_phase1_ms     INT,
    latency_llm_ms        INT,
    latency_total_ms      INT,
    physician_decision    VARCHAR(20) CHECK (physician_decision IN ('AcceptedTop','ChoseOther','NoSuggestion')),
    decided_by            UUID REFERENCES users(user_id),
    decided_at            TIMESTAMPTZ,
    queued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),   -- v1.8: lúc vào hàng đợi (thứ tự FIFO)
    started_at            TIMESTAMPTZ,                          -- v1.8: lúc worker bắt đầu (NULL khi Queued)
    lease_until           TIMESTAMPTZ,                          -- v1.8: hạn thuê việc của worker
    attempt_count         SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    completed_at          TIMESTAMPTZ,
    -- đích của FK kép từ diagnosis (trùng PK về logic, nhưng FK cần đúng bộ cột này)
    CONSTRAINT uq_ai_log_assessment_visit_type UNIQUE (assessment_id, visit_id, run_type),
    -- v1.8: đang chạy thì phải có thời điểm bắt đầu và hạn thuê việc
    CONSTRAINT chk_ai_log_running_lease CHECK (
        status <> 'Running' OR (started_at IS NOT NULL AND lease_until IS NOT NULL)
    ),
    -- v1.8: đã kết thúc thì phải có thời điểm kết thúc
    CONSTRAINT chk_ai_log_finished_time CHECK (
        status NOT IN ('Completed','Degraded','Failed','Skipped') OR completed_at IS NOT NULL
    ),
    -- v1.8: Assessment Completed nghĩa là LLM đã qua Node 4 (Full); Degraded nghĩa là Rule-only
    CONSTRAINT chk_ai_log_mode_status CHECK (
        (status <> 'Completed' OR run_type <> 'Assessment' OR mode IS NOT DISTINCT FROM 'Full')
        AND (status <> 'Degraded' OR mode IS NOT DISTINCT FROM 'RuleOnly')
    )
);

-- =====================================================================
-- 13. DIAGNOSIS
-- =====================================================================
CREATE TABLE diagnosis (
    diagnosis_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id                UUID NOT NULL REFERENCES visit(visit_id),
    physician_id               UUID NOT NULL REFERENCES users(user_id),
    assessment_id           UUID,                                               -- lần chạy AI mà bác sĩ đã xem (FK kép)
    -- cột sinh tự động: hằng 'Assessment' khi có lần chạy AI, để FK kép buộc đúng loại lần chạy
    assessment_run_type     VARCHAR(20) GENERATED ALWAYS AS
                               (CASE WHEN assessment_id IS NULL THEN NULL ELSE 'Assessment' END) STORED,
    condition_code          VARCHAR(80),                                        -- nếu chọn từ danh sách bệnh
    icd10_code              VARCHAR(10),
    diagnosis_name          VARCHAR(255) NOT NULL,
    is_primary              BOOLEAN NOT NULL DEFAULT TRUE,                      -- chẩn đoán chính; kèm theo = FALSE
    matches_top_suggestion  BOOLEAN,                                            -- NULL = không có gợi ý (US02); v1.8: NGUỒN GỐC của tỉ lệ chấp nhận AI
    confirmed_by_physician     BOOLEAN NOT NULL DEFAULT FALSE,
    clinical_notes          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at            TIMESTAMPTZ,
    CONSTRAINT chk_diagnosis_confirmed_time CHECK (confirmed_by_physician = FALSE OR confirmed_at IS NOT NULL),
    CONSTRAINT chk_diagnosis_code_format CHECK (condition_code IS NULL OR condition_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
    -- lần chạy AI phải thuộc CHÍNH lượt khám này và là Assessment (không phải Extraction)
    CONSTRAINT fk_diagnosis_assessment FOREIGN KEY (assessment_id, visit_id, assessment_run_type)
        REFERENCES ai_assessment_log(assessment_id, visit_id, run_type),
    -- v1.8: mã bệnh (nếu chọn từ danh sách) phải là mã đã từng tồn tại trong danh mục
    CONSTRAINT fk_diagnosis_condition FOREIGN KEY (condition_code) REFERENCES condition_key(condition_code)
);
-- mỗi lượt khám tối đa 1 chẩn đoán chính (tỉ lệ chấp nhận AI tính trên chẩn đoán chính)
CREATE UNIQUE INDEX uq_diagnosis_primary_per_visit ON diagnosis(visit_id) WHERE is_primary;

-- =====================================================================
-- 14. DRUG  (hạn dùng nằm ở từng lô, không ở đây; "xóa" = is_active = FALSE)
-- =====================================================================
CREATE TABLE drug (
    drug_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name            VARCHAR(150) NOT NULL,
    trade_name              VARCHAR(150) NOT NULL,
    strength                VARCHAR(50) NOT NULL,                 -- hàm lượng, vd '500 mg', '250 mg/5 ml'
    dosage_form             VARCHAR(50) NOT NULL,                 -- viên nén, viên nang, siro...
    active_ingredient_code  VARCHAR(50),                          -- tùy chọn, giữ để mở rộng DDI về sau
    drug_class              VARCHAR(100),
    unit                    VARCHAR(30) NOT NULL,                 -- đơn vị xuất bán nhỏ nhất
    sale_price              DECIMAL(12,2) NOT NULL CHECK (sale_price >= 0),
    reorder_level           INT NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),  -- ngưỡng tồn thấp (US05)
    is_active               BOOLEAN NOT NULL DEFAULT TRUE
);
-- không trùng thuốc, so sánh không phân biệt hoa thường
CREATE UNIQUE INDEX uq_drug_identity
    ON drug (lower(generic_name), lower(trade_name), lower(strength), lower(dosage_form));

-- =====================================================================
-- 15. PRESCRIPTION  (Draft -> Confirmed (trừ kho) -> Dispensed | Cancelled)
-- =====================================================================
CREATE TABLE prescription (
    prescription_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id         UUID NOT NULL REFERENCES visit(visit_id),
    physician_id        UUID NOT NULL REFERENCES users(user_id),
    status           VARCHAR(20) NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Confirmed','Dispensed','Cancelled')),
    confirmed_at     TIMESTAMPTZ,
    cancelled_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_prescription_confirmed_time
        CHECK (status NOT IN ('Confirmed','Dispensed') OR confirmed_at IS NOT NULL)
);
-- mỗi lượt khám tối đa 1 đơn chưa hủy (sửa đơn = đưa chính đơn đó về Draft)
CREATE UNIQUE INDEX uq_prescription_one_active_per_visit ON prescription(visit_id) WHERE status <> 'Cancelled';

-- =====================================================================
-- 16. PRESCRIPTION_ITEM
-- =====================================================================
CREATE TABLE prescription_item (
    item_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id  UUID NOT NULL REFERENCES prescription(prescription_id),
    drug_id          UUID NOT NULL REFERENCES drug(drug_id),
    dosage           VARCHAR(100) NOT NULL,
    frequency        VARCHAR(100) NOT NULL,
    duration_days    INT NOT NULL CHECK (duration_days > 0),       -- cũng dùng để chọn lô đủ hạn
    quantity         INT NOT NULL CHECK (quantity > 0),
    dispense_status  VARCHAR(20) NOT NULL DEFAULT 'Pending'
                        CHECK (dispense_status IN ('Pending','Dispensed','Skipped')),
    skip_reason      TEXT,
    dispensed_by     UUID REFERENCES users(user_id),
    dispensed_at     TIMESTAMPTZ,
    instruction      TEXT,
    CONSTRAINT chk_item_skip_reason CHECK (dispense_status <> 'Skipped' OR skip_reason IS NOT NULL)
);

-- =====================================================================
-- 17. INVENTORY_BATCH
--     expiry_date: từ chính ngày này lô được coi là HẾT HẠN (thận trọng).
--     Bao bì chỉ ghi tháng/năm -> nhập ngày đầu tiên của tháng đó.
--     Trạng thái Usable/NearExpiry/Expired/Depleted KHÔNG lưu cột, tính trong view.
-- =====================================================================
CREATE TABLE inventory_batch (
    batch_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_id              UUID NOT NULL REFERENCES drug(drug_id),
    created_by           UUID NOT NULL REFERENCES users(user_id),
    batch_number         VARCHAR(50) NOT NULL,
    expiry_date          DATE NOT NULL,
    manufacturing_date   DATE,
    initial_quantity     INT NOT NULL CHECK (initial_quantity > 0),
    remaining_quantity   INT NOT NULL CHECK (remaining_quantity >= 0),   -- không bao giờ âm; CHỈ trigger sổ cái được đổi
    import_price         DECIMAL(12,2) NOT NULL CHECK (import_price >= 0),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),   -- tiêu chí phụ khi 2 lô cùng hạn
    CONSTRAINT chk_batch_dates CHECK (manufacturing_date IS NULL OR expiry_date > manufacturing_date)
);
-- không trùng (thuốc, số lô); nhập thêm cùng lô dùng Adjustment dương
CREATE UNIQUE INDEX uq_batch_drug_number ON inventory_batch(drug_id, batch_number);

-- =====================================================================
-- 18. STOCK_MOVEMENT  (sổ cái tồn kho)
--     Deduct: khi bác sĩ xác nhận đơn (âm) | Restore: hủy/sửa đơn hoặc không cấp phát (dương)
--     Adjustment: điều chỉnh thủ công (Admin), gồm hủy thuốc hết hạn (reason_code = 'Expired')
--     Restore luôn trả về đúng lô đã Deduct của cùng prescription_item_id.
--     Sổ cái chỉ thêm: medassist_app không có quyền UPDATE/DELETE.
-- =====================================================================
CREATE TABLE stock_movement (
    movement_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id              UUID NOT NULL REFERENCES inventory_batch(batch_id),
    performed_by          UUID NOT NULL REFERENCES users(user_id),
    movement_type         VARCHAR(20) NOT NULL CHECK (movement_type IN ('Deduct','Restore','Adjustment')),
    quantity_change       INT NOT NULL,
    prescription_item_id  UUID REFERENCES prescription_item(item_id),
    reason_code           VARCHAR(20) CHECK (reason_code IN ('Expired','Damaged','Lost','CountCorrection','Other')),
    note                  TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_stock_movement_sign CHECK (
        (movement_type = 'Deduct'     AND quantity_change < 0) OR
        (movement_type = 'Restore'    AND quantity_change > 0) OR
        (movement_type = 'Adjustment' AND quantity_change <> 0)
    ),
    -- Deduct/Restore bắt buộc gắn dòng đơn; Adjustment không gắn
    CONSTRAINT chk_stock_movement_ref CHECK (
        (movement_type IN ('Deduct','Restore')) = (prescription_item_id IS NOT NULL)
    ),
    -- Adjustment bắt buộc có reason_code (loại khác không có); 'Other' bắt buộc ghi note
    CONSTRAINT chk_stock_adjustment_reason CHECK (
        (movement_type = 'Adjustment') = (reason_code IS NOT NULL)
        AND (reason_code IS DISTINCT FROM 'Other' OR note IS NOT NULL)
    )
);

-- =====================================================================
-- 19. INVOICE
--     Ba khoản phí là tổng theo loại của invoice_item (Consultation / Paraclinical / Drug).
--     Phí cận lâm sàng là dòng nhập tay trên hóa đơn (không có module chỉ định cận lâm sàng).
--     v1.8: constraint trigger hoãn tới COMMIT ép mỗi khoản phí = tổng dòng cùng loại (trigger 8),
--     nên service ghi invoice và các invoice_item trong cùng transaction, thứ tự tùy ý.
-- =====================================================================
CREATE TABLE invoice (
    invoice_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id           UUID NOT NULL REFERENCES visit(visit_id),
    issued_by          UUID NOT NULL REFERENCES users(user_id),
    invoice_code       VARCHAR(50) UNIQUE NOT NULL,
    consultation_fee   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (consultation_fee >= 0),
    paraclinical_fee   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (paraclinical_fee >= 0),
    drug_fee           DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (drug_fee >= 0),
    total_amount       DECIMAL(12,2) NOT NULL,
    payment_method     VARCHAR(30) NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash','BankingTransfer')),
    payment_status     VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending','Paid','Cancelled')),
    paid_at            TIMESTAMPTZ,
    cancelled_at       TIMESTAMPTZ,
    cancel_reason      TEXT,                                  -- vd dòng thuốc bị bỏ qua sau khi đã xuất -> xuất lại
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_invoice_total CHECK (total_amount = consultation_fee + paraclinical_fee + drug_fee),
    CONSTRAINT chk_invoice_paid_time      CHECK (payment_status <> 'Paid'      OR paid_at IS NOT NULL),
    CONSTRAINT chk_invoice_cancelled_time CHECK (payment_status <> 'Cancelled' OR cancelled_at IS NOT NULL)
);
-- mỗi lượt khám chỉ có tối đa 1 hóa đơn chưa hủy
CREATE UNIQUE INDEX uq_invoice_one_active_per_visit ON invoice(visit_id) WHERE payment_status <> 'Cancelled';

-- =====================================================================
-- 20. INVOICE_ITEM
-- =====================================================================
CREATE TABLE invoice_item (
    invoice_item_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id            UUID NOT NULL REFERENCES invoice(invoice_id),
    item_type             VARCHAR(30) NOT NULL CHECK (item_type IN ('Consultation','Paraclinical','Drug')),
    prescription_item_id  UUID REFERENCES prescription_item(item_id),
    item_name             VARCHAR(150) NOT NULL,
    quantity              INT NOT NULL CHECK (quantity > 0),
    unit_price            DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    subtotal              DECIMAL(12,2) NOT NULL,
    CONSTRAINT chk_invoice_item_source CHECK (
        (item_type = 'Drug' AND prescription_item_id IS NOT NULL) OR
        (item_type IN ('Paraclinical','Consultation') AND prescription_item_id IS NULL)
    ),
    CONSTRAINT chk_invoice_item_subtotal CHECK (subtotal = quantity * unit_price)
);

-- =====================================================================
-- 21. AUDIT_LOG  (append-only)
-- =====================================================================
CREATE TABLE audit_log (
    log_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES users(user_id),       -- v1.8: NULL chỉ với LOGIN_FAILED tên đăng nhập không tồn tại
    attempted_username VARCHAR(50),                      -- v1.8: tên đã nhập khi đăng nhập thất bại
    action_type    VARCHAR(20) NOT NULL CHECK (action_type IN
                     ('LOGIN','LOGIN_FAILED','LOGOUT','VIEW','CREATE','UPDATE','DELETE','EXPORT',
                      'APPROVE','REJECT','RETIRE','AI_ASSESSMENT')),
    target_entity  VARCHAR(50) NOT NULL,
    entity_id      UUID,
    old_values     JSONB,
    new_values     JSONB,
    ip_address     VARCHAR(45),
    user_agent     VARCHAR(255),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- v1.8: mọi dòng có người thực hiện, trừ đăng nhập thất bại (khi đó phải có tên đã nhập)
    CONSTRAINT chk_audit_log_actor CHECK (
        user_id IS NOT NULL OR (action_type = 'LOGIN_FAILED' AND attempted_username IS NOT NULL)
    )
);

-- =====================================================================
-- TRIGGER 1: AUDIT_LOG bất biến (US09: không ai được sửa/xóa, kể cả Admin)
-- =====================================================================
-- v1.7: SQLSTATE 23514 (thống nhất với trigger kho, để lớp xử lý lỗi FastAPI ánh xạ một kiểu);
--       thêm trigger mức câu lệnh vì TRUNCATE không kích hoạt trigger mức dòng.
-- Giới hạn: owner/superuser vẫn có thể ALTER TABLE ... DISABLE TRIGGER. Trigger chặn thao tác
-- nhầm và mọi vai trò ứng dụng; nó không thay được việc giữ kín mật khẩu medassist_owner.
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log là append-only: không cho phép % (US09)', TG_OP
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER trg_audit_log_no_truncate
BEFORE TRUNCATE ON audit_log
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_modification();

-- =====================================================================
-- TRIGGER 2: STOCK_MOVEMENT chỉ trừ từ lô hợp lệ (chốt chặn cho tầng ứng dụng)
--   (a) lô phải cùng thuốc với dòng đơn (Deduct/Restore)
--   (b) Deduct: lô phải còn hạn sau khi dùng hết liệu trình: expiry_date > CURRENT_DATE + duration_days
--   Restore/Adjustment vào lô đã hết hạn vẫn hợp lệ (trả đúng lô cũ, hủy hàng hết hạn).
--   Dùng trigger vì CHECK không được dùng CURRENT_DATE và không đọc được bảng khác.
--   Vùng đệm inventory.min_remaining_shelf_days do ứng dụng áp khi chọn lô FEFO.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_stock_movement_batch_eligible()
RETURNS TRIGGER AS $$
DECLARE
    b_drug    UUID;
    b_expiry  DATE;
    i_drug    UUID;
    i_days    INT;
BEGIN
    SELECT drug_id, expiry_date INTO b_drug, b_expiry
    FROM inventory_batch WHERE batch_id = NEW.batch_id;
    -- v1.7: lô không tồn tại -> để khóa ngoại báo đúng lỗi 23503, không báo nhầm "sai thuốc"
    IF NOT FOUND THEN RETURN NEW; END IF;

    IF NEW.prescription_item_id IS NOT NULL THEN
        SELECT drug_id, duration_days INTO i_drug, i_days
        FROM prescription_item WHERE item_id = NEW.prescription_item_id;
        IF NOT FOUND THEN RETURN NEW; END IF;   -- như trên, nhường cho khóa ngoại
        IF i_drug <> b_drug THEN
            RAISE EXCEPTION 'Lô % không thuộc thuốc của dòng đơn %', NEW.batch_id, NEW.prescription_item_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- COALESCE: Deduct thiếu dòng đơn đã bị chk_stock_movement_ref chặn (CHECK chạy SAU
    -- trigger BEFORE); COALESCE chỉ để biểu thức không bao giờ ra NULL.
    IF NEW.movement_type = 'Deduct' AND b_expiry <= CURRENT_DATE + COALESCE(i_days, 0) THEN
        RAISE EXCEPTION 'Lô % hết hạn ngày % trước khi kết thúc liệu trình % ngày', NEW.batch_id, b_expiry, COALESCE(i_days, 0)
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movement_batch_eligible
BEFORE INSERT ON stock_movement
FOR EACH ROW EXECUTE FUNCTION fn_stock_movement_batch_eligible();

-- =====================================================================
-- TRIGGER 3: STOCK_MOVEMENT -> INVENTORY_BATCH (sổ cái là nguồn sự thật)
--   Mỗi dòng sổ cái cộng quantity_change vào lô ngay trong cùng câu lệnh INSERT.
--   Tồn âm -> CHECK remaining_quantity >= 0 báo 23514 -> cả transaction rollback,
--   nên không thể có "đã ghi sổ cái nhưng chưa trừ kho" hoặc ngược lại.
--   Ứng dụng KHÔNG tự UPDATE remaining_quantity (sẽ bị trigger 4 chặn).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_stock_movement_apply()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory_batch
    SET remaining_quantity = remaining_quantity + NEW.quantity_change
    WHERE batch_id = NEW.batch_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movement_apply
AFTER INSERT ON stock_movement
FOR EACH ROW EXECUTE FUNCTION fn_stock_movement_apply();

-- =====================================================================
-- TRIGGER 4: INVENTORY_BATCH chặn sửa tay số lượng
--   INSERT: remaining_quantity phải bằng initial_quantity (chưa có biến động nào).
--   UPDATE: initial_quantity bất biến; remaining_quantity chỉ đổi được khi lệnh UPDATE đến
--   từ trigger 3 (pg_trigger_depth() > 1). Nhập thêm cùng lô = Adjustment dương.
--   Không dùng quyền theo cột vì trigger 3 chạy bằng quyền của người gọi (medassist_app).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_inventory_batch_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.remaining_quantity <> NEW.initial_quantity THEN
            RAISE EXCEPTION 'Lô mới phải có remaining_quantity = initial_quantity (% <> %)',
                NEW.remaining_quantity, NEW.initial_quantity USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        IF NEW.initial_quantity IS DISTINCT FROM OLD.initial_quantity THEN
            RAISE EXCEPTION 'initial_quantity của lô % là bất biến; dùng Adjustment', OLD.batch_id
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.remaining_quantity IS DISTINCT FROM OLD.remaining_quantity AND pg_trigger_depth() < 2 THEN
            RAISE EXCEPTION 'remaining_quantity của lô % chỉ thay đổi qua stock_movement', OLD.batch_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_batch_guard
BEFORE INSERT OR UPDATE ON inventory_batch
FOR EACH ROW EXECUTE FUNCTION fn_inventory_batch_guard();

-- =====================================================================
-- TRIGGER 5: INVOICE_ITEM dòng Drug phải thuộc đơn thuốc của CÙNG lượt khám với hóa đơn
--   (cách hai bước invoice_item -> invoice.visit_id và prescription_item -> prescription.visit_id,
--   nên khóa ngoại kép không đủ). Quy ước: visit_id của invoice và prescription không đổi sau khi tạo.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_invoice_item_same_visit()
RETURNS TRIGGER AS $$
DECLARE inv_visit UUID; rx_visit UUID;
BEGIN
    IF NEW.prescription_item_id IS NULL THEN RETURN NEW; END IF;
    SELECT visit_id INTO inv_visit FROM invoice WHERE invoice_id = NEW.invoice_id;
    IF NOT FOUND THEN RETURN NEW; END IF;          -- nhường khóa ngoại báo 23503
    SELECT p.visit_id INTO rx_visit
    FROM prescription_item i JOIN prescription p ON p.prescription_id = i.prescription_id
    WHERE i.item_id = NEW.prescription_item_id;
    IF NOT FOUND THEN RETURN NEW; END IF;          -- như trên
    IF rx_visit <> inv_visit THEN
        RAISE EXCEPTION 'Dòng thuốc % thuộc lượt khám khác với hóa đơn %', NEW.prescription_item_id, NEW.invoice_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_item_same_visit
BEFORE INSERT OR UPDATE OF invoice_id, prescription_item_id ON invoice_item
FOR EACH ROW EXECUTE FUNCTION fn_invoice_item_same_visit();

-- =====================================================================
-- TRIGGER 6 (v1.8): tự đăng ký mã ổn định khi tạo dòng phiên bản symptom/condition
--   BEFORE INSERT chạy trước khi khóa ngoại fk_symptom_key / fk_condition_key được kiểm,
--   nên dòng phiên bản đầu tiên của một mã tự tạo dòng định danh. Quan hệ, khuyến cáo,
--   chẩn đoán KHÔNG tự đăng ký: mã gõ sai ở đó bị khóa ngoại chặn.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_knowledge_key_register()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'symptom' THEN
        INSERT INTO symptom_key (symptom_code) VALUES (NEW.symptom_code) ON CONFLICT DO NOTHING;
    ELSE
        INSERT INTO condition_key (condition_code) VALUES (NEW.condition_code) ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_symptom_key_register
BEFORE INSERT ON symptom
FOR EACH ROW EXECUTE FUNCTION fn_knowledge_key_register();

CREATE TRIGGER trg_condition_key_register
BEFORE INSERT ON condition
FOR EACH ROW EXECUTE FUNCTION fn_knowledge_key_register();

-- =====================================================================
-- TRIGGER 7 (v1.8): tăng knowledge_epoch khi bảng tri thức thay đổi
--   Mức câu lệnh, chạy với mọi INSERT/UPDATE trên 5 bảng tri thức (kể cả khi chỉ sửa Draft:
--   cache nạp lại thừa một lần là chấp nhận được, đổi lại không bao giờ bỏ sót).
--   Duyệt release, Superseded và tắt khẩn cấp (Deactivated) đều đi qua UPDATE status nên đều
--   tăng epoch trong chính transaction đó.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_knowledge_epoch_bump()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE knowledge_epoch SET epoch = epoch + 1, changed_at = now() WHERE singleton;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_symptom_epoch           AFTER INSERT OR UPDATE ON symptom
    FOR EACH STATEMENT EXECUTE FUNCTION fn_knowledge_epoch_bump();
CREATE TRIGGER trg_condition_epoch         AFTER INSERT OR UPDATE ON condition
    FOR EACH STATEMENT EXECUTE FUNCTION fn_knowledge_epoch_bump();
CREATE TRIGGER trg_condition_symptom_epoch AFTER INSERT OR UPDATE ON condition_symptom
    FOR EACH STATEMENT EXECUTE FUNCTION fn_knowledge_epoch_bump();
CREATE TRIGGER trg_guideline_excerpt_epoch AFTER INSERT OR UPDATE ON guideline_excerpt
    FOR EACH STATEMENT EXECUTE FUNCTION fn_knowledge_epoch_bump();
CREATE TRIGGER trg_triage_rule_epoch       AFTER INSERT OR UPDATE ON triage_rule
    FOR EACH STATEMENT EXECUTE FUNCTION fn_knowledge_epoch_bump();

-- =====================================================================
-- TRIGGER 8 (v1.8): ba khoản phí của hóa đơn = tổng invoice_item cùng loại
--   Constraint trigger HOÃN tới COMMIT (DEFERRABLE INITIALLY DEFERRED): trong transaction,
--   service ghi invoice rồi các dòng (hoặc ngược lại) đều được; chỉ trạng thái cuối bị kiểm.
--   Kiểm cả hóa đơn đã hủy: dòng của hóa đơn cũ không đổi nên điều kiện vẫn giữ.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_invoice_fee_consistency()
RETURNS TRIGGER AS $$
DECLARE
    ids  UUID[];
    inv  RECORD;
BEGIN
    IF TG_TABLE_NAME = 'invoice' THEN
        ids := ARRAY[NEW.invoice_id];
    ELSIF TG_OP = 'DELETE' THEN
        ids := ARRAY[OLD.invoice_id];
    ELSIF TG_OP = 'UPDATE' THEN
        ids := ARRAY[NEW.invoice_id, OLD.invoice_id];
    ELSE
        ids := ARRAY[NEW.invoice_id];
    END IF;

    FOR inv IN
        SELECT i.invoice_id, i.consultation_fee, i.paraclinical_fee, i.drug_fee,
               COALESCE(SUM(t.subtotal) FILTER (WHERE t.item_type = 'Consultation'), 0) AS s_cons,
               COALESCE(SUM(t.subtotal) FILTER (WHERE t.item_type = 'Paraclinical'), 0) AS s_para,
               COALESCE(SUM(t.subtotal) FILTER (WHERE t.item_type = 'Drug'), 0)         AS s_drug
        FROM invoice i LEFT JOIN invoice_item t ON t.invoice_id = i.invoice_id
        WHERE i.invoice_id = ANY (ids)
        GROUP BY i.invoice_id
    LOOP
        IF inv.consultation_fee <> inv.s_cons OR inv.paraclinical_fee <> inv.s_para OR inv.drug_fee <> inv.s_drug THEN
            RAISE EXCEPTION 'Hóa đơn %: phí (khám %, CLS %, thuốc %) lệch tổng dòng (khám %, CLS %, thuốc %)',
                inv.invoice_id, inv.consultation_fee, inv.paraclinical_fee, inv.drug_fee,
                inv.s_cons, inv.s_para, inv.s_drug
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_invoice_fee_consistency
AFTER INSERT OR UPDATE OF consultation_fee, paraclinical_fee, drug_fee ON invoice
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_invoice_fee_consistency();

CREATE CONSTRAINT TRIGGER trg_invoice_item_fee_consistency
AFTER INSERT OR UPDATE OF invoice_id, item_type, subtotal OR DELETE ON invoice_item
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_invoice_fee_consistency();

-- =====================================================================
-- VIEWS: trạng thái hạn dùng và tồn kho (tính theo CURRENT_DATE, múi giờ DB)
-- =====================================================================
-- Trạng thái từng lô: Depleted | Expired (expiry_date <= hôm nay) | NearExpiry (trong N ngày) | Usable
CREATE VIEW v_inventory_batch_status AS
SELECT b.batch_id, b.drug_id, b.batch_number, b.expiry_date, b.remaining_quantity,
       (b.expiry_date - CURRENT_DATE) AS days_to_expiry,
       CASE WHEN b.remaining_quantity = 0                   THEN 'Depleted'
            WHEN b.expiry_date <= CURRENT_DATE               THEN 'Expired'
            WHEN b.expiry_date <= CURRENT_DATE + s.near_days THEN 'NearExpiry'
            ELSE 'Usable' END AS batch_status
FROM inventory_batch b
CROSS JOIN (SELECT COALESCE((SELECT (value #>> '{}')::int FROM system_setting
                             WHERE setting_key = 'inventory.near_expiry_days'), 90) AS near_days) s;

-- Tồn theo thuốc: tách dùng được / sắp hết hạn / đã hết hạn; cờ tồn thấp (US05) không tính hàng hết hạn
CREATE VIEW v_drug_stock AS
SELECT d.drug_id, d.generic_name, d.strength, d.unit, d.reorder_level,
       COALESCE(SUM(v.remaining_quantity) FILTER (WHERE v.batch_status IN ('Usable','NearExpiry')), 0) AS usable_quantity,
       COALESCE(SUM(v.remaining_quantity) FILTER (WHERE v.batch_status = 'NearExpiry'), 0)          AS near_expiry_quantity,
       COALESCE(SUM(v.remaining_quantity) FILTER (WHERE v.batch_status = 'Expired'), 0)             AS expired_quantity,
       MIN(v.expiry_date) FILTER (WHERE v.batch_status IN ('Usable','NearExpiry'))                  AS nearest_expiry,
       COALESCE(SUM(v.remaining_quantity) FILTER (WHERE v.batch_status IN ('Usable','NearExpiry')), 0)
           <= d.reorder_level AS is_low_stock
FROM drug d
LEFT JOIN v_inventory_batch_status v ON v.drug_id = d.drug_id
WHERE d.is_active
GROUP BY d.drug_id, d.generic_name, d.strength, d.unit, d.reorder_level;

-- Đối soát: lô có remaining_quantity lệch với sổ cái. Luôn phải RỖNG (kiểm thử + báo cáo Admin).
CREATE VIEW v_inventory_reconciliation AS
SELECT b.batch_id, b.drug_id, b.batch_number, b.initial_quantity, b.remaining_quantity,
       b.initial_quantity + COALESCE(SUM(m.quantity_change), 0) AS ledger_quantity
FROM inventory_batch b
LEFT JOIN stock_movement m ON m.batch_id = b.batch_id
GROUP BY b.batch_id
HAVING b.remaining_quantity <> b.initial_quantity + COALESCE(SUM(m.quantity_change), 0);

-- =====================================================================
-- VIEW (v1.8): toàn vẹn của TẬP TRI THỨC ACTIVE. Luôn phải RỖNG sau mỗi COMMIT
--   (trigger 9 ép). Khóa ngoại tới symptom_key/condition_key chỉ bảo đảm mã TỒN TẠI;
--   view này bảo đảm mã đang được tham chiếu bởi một mục Active thì cũng CÒN Active.
--   Luật: mọi giá trị của khóa "symptom_code" và "vital" ở bất kỳ độ sâu nào trong cây
--   condition_logic đều được kiểm (định dạng cây chi tiết ở knowledge/_spec/okf_format.md).
-- =====================================================================
CREATE VIEW v_knowledge_integrity_issues AS
WITH active_symptom   AS (SELECT symptom_code   FROM symptom   WHERE status = 'Active'),
     active_condition AS (SELECT condition_code FROM condition WHERE status = 'Active')
SELECT 'condition_symptom'::text AS item_table, cs.relation_id AS item_id,
       cs.condition_code || '/' || cs.symptom_code AS item_key,
       'SYMPTOM_NOT_ACTIVE'::text AS issue, cs.symptom_code::text AS missing_code
FROM condition_symptom cs
WHERE cs.status = 'Active' AND cs.symptom_code NOT IN (SELECT symptom_code FROM active_symptom)
UNION ALL
SELECT 'condition_symptom', cs.relation_id, cs.condition_code || '/' || cs.symptom_code,
       'CONDITION_NOT_ACTIVE', cs.condition_code
FROM condition_symptom cs
WHERE cs.status = 'Active' AND cs.condition_code NOT IN (SELECT condition_code FROM active_condition)
UNION ALL
SELECT 'guideline_excerpt', g.excerpt_id, g.excerpt_key, 'CONDITION_NOT_ACTIVE', g.condition_code
FROM guideline_excerpt g
WHERE g.status = 'Active' AND g.condition_code NOT IN (SELECT condition_code FROM active_condition)
UNION ALL
SELECT 'triage_rule', r.triage_rule_id, r.rule_key, 'SYMPTOM_NOT_ACTIVE', sc.code
FROM triage_rule r
CROSS JOIN LATERAL (SELECT DISTINCT v #>> '{}' AS code
                    FROM jsonb_path_query(r.condition_logic, 'lax $.**.symptom_code') v) sc
WHERE r.status = 'Active' AND sc.code NOT IN (SELECT symptom_code FROM active_symptom)
UNION ALL
SELECT 'triage_rule', r.triage_rule_id, r.rule_key, 'UNKNOWN_VITAL_KEY', vk.code
FROM triage_rule r
CROSS JOIN LATERAL (SELECT DISTINCT v #>> '{}' AS code
                    FROM jsonb_path_query(r.condition_logic, 'lax $.**.vital') v) vk
WHERE r.status = 'Active' AND NOT (vk.code = ANY (fn_vital_sign_keys()));

-- =====================================================================
-- TRIGGER 9 (v1.8): ép v_knowledge_integrity_issues rỗng tại COMMIT
--   Constraint trigger hoãn trên 5 bảng tri thức. Kiểm ở COMMIT nên trong transaction duyệt
--   release, thứ tự Superseded/Active không quan trọng. Tắt khẩn cấp một triệu chứng/bệnh mà
--   chưa tắt các mục phụ thuộc thì COMMIT bị từ chối (23514) kèm danh sách mục phụ thuộc,
--   vì vậy Knowledge Service phải tắt dây chuyền trong cùng transaction.
--   Mỗi transaction chỉ quét view một lần (cờ cục bộ theo transaction), dù đổi hàng trăm dòng.
--   Lưu ý: nếu ai đó SET CONSTRAINTS ... IMMEDIATE giữa transaction rồi sửa tiếp, lần kiểm
--   sau bị bỏ qua — không dùng SET CONSTRAINTS trên các bảng tri thức.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_knowledge_integrity_check()
RETURNS TRIGGER AS $$
DECLARE
    tx      TEXT := txid_current()::text;
    issues  TEXT;
BEGIN
    IF current_setting('medassist.knowledge_checked_tx', TRUE) IS NOT DISTINCT FROM tx THEN
        RETURN NULL;
    END IF;
    PERFORM set_config('medassist.knowledge_checked_tx', tx, TRUE);

    SELECT string_agg(format('%s %s: %s (%s)', item_table, item_key, issue, missing_code), '; ')
      INTO issues
    FROM (SELECT * FROM v_knowledge_integrity_issues ORDER BY item_table, item_key LIMIT 20) x;

    IF issues IS NOT NULL THEN
        RAISE EXCEPTION 'Tập tri thức Active không khép kín: %', issues
            USING ERRCODE = 'check_violation',
                  HINT = 'Tắt/kích hoạt các mục phụ thuộc trong cùng transaction.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_symptom_integrity AFTER INSERT OR UPDATE ON symptom
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_knowledge_integrity_check();
CREATE CONSTRAINT TRIGGER trg_condition_integrity AFTER INSERT OR UPDATE ON condition
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_knowledge_integrity_check();
CREATE CONSTRAINT TRIGGER trg_condition_symptom_integrity AFTER INSERT OR UPDATE ON condition_symptom
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_knowledge_integrity_check();
CREATE CONSTRAINT TRIGGER trg_guideline_excerpt_integrity AFTER INSERT OR UPDATE ON guideline_excerpt
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_knowledge_integrity_check();
CREATE CONSTRAINT TRIGGER trg_triage_rule_integrity AFTER INSERT OR UPDATE ON triage_rule
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_knowledge_integrity_check();

-- =====================================================================
-- VIEW (v1.8): đối soát quyết định của bác sĩ. Luôn phải RỖNG.
--   Nguồn gốc là diagnosis.matches_top_suggestion của chẩn đoán chính đã xác nhận;
--   ai_assessment_log.physician_decision là bản ghi kèm, service ghi cả hai trong cùng
--   transaction: TRUE -> AcceptedTop, FALSE -> ChoseOther, NULL -> NoSuggestion.
-- =====================================================================
CREATE VIEW v_ai_decision_reconciliation AS
SELECT d.diagnosis_id, d.visit_id, d.assessment_id, d.matches_top_suggestion,
       CASE WHEN d.matches_top_suggestion IS NULL THEN 'NoSuggestion'
            WHEN d.matches_top_suggestion            THEN 'AcceptedTop'
            ELSE 'ChoseOther' END AS expected_decision,
       a.physician_decision AS logged_decision
FROM diagnosis d
JOIN ai_assessment_log a ON a.assessment_id = d.assessment_id
WHERE d.is_primary AND d.confirmed_by_physician
  AND a.physician_decision IS DISTINCT FROM
      CASE WHEN d.matches_top_suggestion IS NULL THEN 'NoSuggestion'
           WHEN d.matches_top_suggestion            THEN 'AcceptedTop'
           ELSE 'ChoseOther' END;

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX idx_release_status            ON knowledge_release(status);
CREATE INDEX idx_symptom_release           ON symptom(release_id);
CREATE INDEX idx_condition_release         ON condition(release_id);
CREATE INDEX idx_condition_group           ON condition(disease_group) WHERE status = 'Active';
CREATE INDEX idx_cond_symptom_cond_active  ON condition_symptom(condition_code) WHERE status = 'Active';
CREATE INDEX idx_cond_symptom_sym_active   ON condition_symptom(symptom_code)   WHERE status = 'Active';
CREATE INDEX idx_cond_symptom_release      ON condition_symptom(release_id);
CREATE INDEX idx_excerpt_condition_active  ON guideline_excerpt(condition_code) WHERE status = 'Active';
CREATE INDEX idx_triage_rule_release       ON triage_rule(release_id);
CREATE INDEX idx_triage_rule_logic         ON triage_rule USING GIN (condition_logic);
CREATE INDEX idx_visit_patient             ON visit(patient_id, visit_date DESC);   -- v1.8: lịch sử EMR mới nhất trước
CREATE INDEX idx_visit_queue               ON visit(queue_date, status, triage_priority, visit_date) WHERE status IN ('Waiting','CheckedIn');
CREATE INDEX idx_visit_physician              ON visit(physician_id);
CREATE INDEX idx_visit_symptom_visit       ON visit_symptom(visit_id);
CREATE INDEX idx_visit_symptom_symptom     ON visit_symptom(symptom_id);
CREATE INDEX idx_ai_log_visit              ON ai_assessment_log(visit_id, queued_at DESC);   -- v1.8: started_at có thể NULL
CREATE INDEX idx_ai_log_queue              ON ai_assessment_log(queued_at) WHERE status = 'Queued';    -- v1.8: worker lấy việc
CREATE INDEX idx_ai_log_lease              ON ai_assessment_log(lease_until) WHERE status = 'Running'; -- v1.8: sweeper
CREATE INDEX idx_ai_log_release            ON ai_assessment_log(knowledge_release_id);
CREATE INDEX idx_diagnosis_visit           ON diagnosis(visit_id);
CREATE INDEX idx_prescription_visit        ON prescription(visit_id);
CREATE INDEX idx_presc_item_presc          ON prescription_item(prescription_id);
CREATE INDEX idx_presc_item_drug           ON prescription_item(drug_id);
CREATE INDEX idx_batch_drug_expiry         ON inventory_batch(drug_id, expiry_date) WHERE remaining_quantity > 0;  -- chọn lô FEFO
CREATE INDEX idx_stock_movement_batch      ON stock_movement(batch_id);
CREATE INDEX idx_stock_movement_item       ON stock_movement(prescription_item_id);
CREATE INDEX idx_invoice_paid_at           ON invoice(paid_at) WHERE payment_status = 'Paid';   -- v1.8: báo cáo doanh thu
CREATE INDEX idx_invoice_item_inv          ON invoice_item(invoice_id);
CREATE INDEX idx_invoice_item_presc        ON invoice_item(prescription_item_id);
CREATE INDEX idx_audit_log_user            ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity          ON audit_log(target_entity, entity_id);
CREATE INDEX idx_audit_log_created         ON audit_log(created_at DESC);
-- v1.8: tìm bệnh nhân tái khám (tên không dấu, số điện thoại); dùng đúng biểu thức của chỉ mục
CREATE INDEX idx_patient_name_trgm         ON patient USING GIN (lower(f_unaccent(full_name)) gin_trgm_ops);
CREATE INDEX idx_patient_phone             ON patient(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_diagnosis_condition       ON diagnosis(condition_code) WHERE condition_code IS NOT NULL;  -- v1.8: FK mới

-- =====================================================================
-- PHÂN QUYỀN (NFR02 — least privilege)
-- Vai trò, owner database, quyền CONNECT và USAGE trên schema: server/db/initdb/sql/01_roles.sql.
-- Ở đây chỉ cấp quyền trên các đối tượng vừa tạo (người chạy = medassist_owner = chủ sở hữu).
-- =====================================================================

-- medassist_app (FastAPI, script nạp OKF): đọc/ghi nghiệp vụ, KHÔNG DELETE, KHÔNG TRUNCATE
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO medassist_app;
-- nhật ký và sổ cái chỉ thêm
REVOKE UPDATE ON audit_log, stock_movement FROM medassist_app;
-- ai_assessment_log vẫn cần UPDATE (completed_at, physician_decision), chỉ không DELETE
-- view chỉ để đọc
REVOKE INSERT, UPDATE ON v_inventory_batch_status, v_drug_stock, v_inventory_reconciliation,
                         v_knowledge_integrity_issues, v_ai_decision_reconciliation FROM medassist_app;
-- v1.8: mã định danh OKF không bao giờ đổi
REVOKE UPDATE ON symptom_key, condition_key FROM medassist_app;
-- v1.8: knowledge_epoch chỉ do trigger tăng (trigger chạy bằng quyền người gọi nên app vẫn cần
-- UPDATE trên bảng này); app không được INSERT dòng thứ hai (CHECK singleton cũng chặn)
REVOKE INSERT ON knowledge_epoch FROM medassist_app;

-- medassist_backup (pg_dump hằng ngày): chỉ đọc
GRANT SELECT ON ALL TABLES IN SCHEMA public TO medassist_backup;

-- v1.7: bảng alembic_version (Alembic tạo trước khi chạy revision này) không cho app ghi
DO $$ BEGIN
    IF to_regclass('public.alembic_version') IS NOT NULL THEN
        REVOKE INSERT, UPDATE ON public.alembic_version FROM medassist_app;
    END IF;
END $$;

-- v1.7 [SỬA LỖI CHÍNH]: bảng/sequence do medassist_owner tạo ở các migration SAU tự có quyền.
-- Thiếu phần này (như v1.6) thì mỗi bảng mới đều khiến API báo permission denied.
-- Lưu ý khi thêm bảng chỉ-thêm mới: migration đó phải tự REVOKE UPDATE khỏi medassist_app.
ALTER DEFAULT PRIVILEGES FOR ROLE medassist_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE ON TABLES    TO medassist_app;
ALTER DEFAULT PRIVILEGES FOR ROLE medassist_owner IN SCHEMA public
    GRANT USAGE, SELECT          ON SEQUENCES TO medassist_app;
ALTER DEFAULT PRIVILEGES FOR ROLE medassist_owner IN SCHEMA public
    GRANT SELECT                 ON TABLES    TO medassist_backup;

-- =====================================================================
-- Hết script — 25 bảng + 5 view + 20 trigger, đúng theo ERD_MedAssist_v1_8.md
-- =====================================================================
