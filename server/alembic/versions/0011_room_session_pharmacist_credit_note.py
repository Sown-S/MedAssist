"""Ca làm việc, dược sĩ, phiếu hoàn tiền, kết quả CLS dạng số, bên tổn thương, tái khám, VAS, trigger_when (ERD v2.4)

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

_OPEN = sa.text("ended_at IS NULL")
_LATERALITY = "laterality IS NULL OR laterality IN ('Left', 'Right', 'Bilateral')"
_WARNING_TAGS = "'nsaid', 'corticoid', 'gi_protect', 'weekly_dose', 'needs_folate', 'pregnancy_contraindicated'"

_VITAL_KEYS = """
CREATE OR REPLACE FUNCTION fn_vital_sign_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT ARRAY['temperature_c','heart_rate_bpm','respiratory_rate_bpm',
                       'systolic_bp_mmhg','diastolic_bp_mmhg','spo2_pct',
                       'weight_kg','height_cm'{extra}]::text[] $$;
"""

# Upgrade kiểm mã của luật ở cả condition_logic và trigger_when (ERD §3); downgrade chỉ condition_logic
_INTEGRITY_VIEW = """
CREATE OR REPLACE VIEW v_knowledge_integrity_issues AS
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
CROSS JOIN LATERAL (SELECT DISTINCT v #>> '{{}}' AS code
                    FROM jsonb_path_query({trees}, 'lax $.**.symptom_code') v) sc
WHERE r.status = 'Active' AND sc.code NOT IN (SELECT symptom_code FROM active_symptom)
UNION ALL
SELECT 'triage_rule', r.triage_rule_id, r.rule_key, 'UNKNOWN_VITAL_KEY', vk.code
FROM triage_rule r
CROSS JOIN LATERAL (SELECT DISTINCT v #>> '{{}}' AS code
                    FROM jsonb_path_query({trees}, 'lax $.**.vital') v) vk
WHERE r.status = 'Active' AND NOT (vk.code = ANY (fn_vital_sign_keys()));
"""

_CREDIT_NOTE_FUNCTIONS = """
CREATE OR REPLACE FUNCTION fn_credit_note_item_guard()
RETURNS TRIGGER AS $$
DECLARE cn_invoice UUID; item_invoice UUID; item_qty INT; item_price NUMERIC; inv_status TEXT; credited BIGINT;
BEGIN
    SELECT invoice_id INTO cn_invoice FROM credit_note WHERE credit_note_id = NEW.credit_note_id;
    IF NOT FOUND THEN RETURN NEW; END IF;          -- nhường khóa ngoại báo 23503
    -- Khóa dòng gốc trước khi cộng dồn: hai phiếu lập cùng lúc phải chờ nhau, không hoàn quá
    SELECT invoice_id, quantity, unit_price INTO item_invoice, item_qty, item_price
    FROM invoice_item WHERE invoice_item_id = NEW.invoice_item_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF item_invoice <> cn_invoice THEN
        RAISE EXCEPTION 'Dòng hóa đơn % không thuộc hóa đơn % của phiếu hoàn tiền', NEW.invoice_item_id, cn_invoice
            USING ERRCODE = 'check_violation';
    END IF;
    -- FOR SHARE: hóa đơn không bị hủy song song khi đang lập phiếu
    SELECT payment_status INTO inv_status FROM invoice WHERE invoice_id = cn_invoice FOR SHARE;
    IF inv_status IS DISTINCT FROM 'Paid' THEN
        RAISE EXCEPTION 'Hóa đơn % đang %, chỉ hoàn tiền hóa đơn đã thanh toán', cn_invoice, inv_status
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.unit_price <> item_price THEN
        RAISE EXCEPTION 'Dòng hóa đơn %: đơn giá hoàn % khác đơn giá đã thu %', NEW.invoice_item_id, NEW.unit_price, item_price
            USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(SUM(quantity), 0) INTO credited FROM credit_note_item WHERE invoice_item_id = NEW.invoice_item_id;
    IF credited + NEW.quantity > item_qty THEN
        RAISE EXCEPTION 'Dòng hóa đơn %: hoàn % cộng đã hoàn % vượt số lượng %',
            NEW.invoice_item_id, NEW.quantity, credited, item_qty
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_credit_note_total_consistency()
RETURNS TRIGGER AS $$
DECLARE cn RECORD;
BEGIN
    SELECT c.credit_note_id, c.total_amount, COALESCE(SUM(t.subtotal), 0) AS items_total,
           COUNT(t.credit_item_id) AS item_count
      INTO cn
    FROM credit_note c LEFT JOIN credit_note_item t ON t.credit_note_id = c.credit_note_id
    WHERE c.credit_note_id = NEW.credit_note_id
    GROUP BY c.credit_note_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF cn.item_count = 0 THEN
        RAISE EXCEPTION 'Phiếu hoàn tiền % không có dòng nào', cn.credit_note_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF cn.total_amount <> cn.items_total THEN
        RAISE EXCEPTION 'Phiếu hoàn tiền %: tổng % lệch tổng dòng %', cn.credit_note_id, cn.total_amount, cn.items_total
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_credit_note_item_guard BEFORE INSERT ON credit_note_item
FOR EACH ROW EXECUTE FUNCTION fn_credit_note_item_guard();

CREATE CONSTRAINT TRIGGER trg_credit_note_total_consistency
AFTER INSERT ON credit_note
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_credit_note_total_consistency();

CREATE CONSTRAINT TRIGGER trg_credit_note_item_total_consistency
AFTER INSERT ON credit_note_item
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_credit_note_total_consistency();
"""


def _role_check(roles: str) -> None:
    op.drop_constraint("users_role_check", "users", type_="check")
    op.create_check_constraint("users_role_check", "users", f"role IN ({roles})")


def upgrade() -> None:
    # --- Tài khoản, ca làm việc -------------------------------------------------------------------
    _role_check("'Physician','Nurse','Pharmacist','Admin'")
    # Nhiều bác sĩ dùng chung phòng mặc định; phòng đang ngồi là ca mở trong room_session
    op.drop_index("uq_users_active_room", table_name="users")

    op.create_table(
        "room_session",
        sa.Column("session_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("physician_id", sa.Uuid(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("ended_reason", sa.String(15)),
        sa.Column("ended_by", sa.Uuid()),
        sa.ForeignKeyConstraint(["room_id"], ["room.room_id"], name="fk_room_session_room"),
        sa.ForeignKeyConstraint(["physician_id"], ["users.user_id"], name="fk_room_session_physician"),
        sa.ForeignKeyConstraint(["ended_by"], ["users.user_id"], name="room_session_ended_by_fkey"),
        sa.CheckConstraint(
            "(ended_at IS NULL) = (ended_reason IS NULL) AND (ended_at IS NULL) = (ended_by IS NULL) "
            "AND COALESCE(ended_reason IN ('EndShift', 'TakenOver', 'AccountLocked'), true) "
            "AND COALESCE(ended_at >= started_at, true)",
            name="chk_room_session_end",
        ),
    )
    op.create_index("uq_room_session_open_room", "room_session", ["room_id"], unique=True, postgresql_where=_OPEN)
    op.create_index(
        "uq_room_session_open_physician", "room_session", ["physician_id"], unique=True, postgresql_where=_OPEN
    )

    # --- Lượt khám --------------------------------------------------------------------------------
    op.add_column("visit", sa.Column("exam_room_id", sa.Uuid()))
    op.add_column("visit", sa.Column("target_room_id", sa.Uuid()))
    op.add_column("visit", sa.Column("follow_up_date", sa.Date()))
    op.create_foreign_key("fk_visit_exam_room", "visit", "room", ["exam_room_id"], ["room_id"])
    op.create_foreign_key("fk_visit_target_room", "visit", "room", ["target_room_id"], ["room_id"])
    op.create_check_constraint("chk_visit_exam_room", "visit", "exam_room_id IS NULL OR physician_id IS NOT NULL")
    op.create_check_constraint(
        "chk_visit_follow_up", "visit", "follow_up_date IS NULL OR follow_up_date > queue_date"
    )
    op.create_index(
        "idx_visit_follow_up", "visit", ["follow_up_date"], postgresql_where=sa.text("follow_up_date IS NOT NULL")
    )
    # Trước 0011 bác sĩ gắn cố định một phòng: phòng của lượt cũ là phòng của bác sĩ (ERD §2.10)
    op.execute(
        "UPDATE visit v SET exam_room_id = u.room_id FROM users u "
        "WHERE u.user_id = v.physician_id AND u.room_id IS NOT NULL AND v.exam_room_id IS NULL"
    )
    op.execute(_VITAL_KEYS.format(extra=",'pain_vas'"))

    # --- Chẩn đoán, chỉ định, kết quả -------------------------------------------------------------
    op.add_column("diagnosis", sa.Column("laterality", sa.String(10)))
    op.create_check_constraint("chk_diagnosis_laterality", "diagnosis", _LATERALITY)

    op.add_column("service_order_item", sa.Column("laterality", sa.String(10)))
    op.add_column("service_order_item", sa.Column("numeric_value", sa.Numeric(12, 3)))
    op.add_column("service_order_item", sa.Column("result_unit", sa.String(30)))
    op.add_column("service_order_item", sa.Column("ref_low", sa.Numeric(12, 3)))
    op.add_column("service_order_item", sa.Column("ref_high", sa.Numeric(12, 3)))
    op.add_column("service_order_item", sa.Column("abnormal_flag", sa.String(1)))
    op.create_check_constraint("chk_service_order_item_laterality", "service_order_item", _LATERALITY)
    op.create_check_constraint(
        "chk_service_order_item_numeric",
        "service_order_item",
        "(numeric_value IS NULL OR result IS NOT NULL) "
        "AND (abnormal_flag IS NULL OR (numeric_value IS NOT NULL AND abnormal_flag IN ('H', 'L', 'N')))",
    )

    # --- Thuốc ------------------------------------------------------------------------------------
    op.add_column(
        "drug", sa.Column("warning_tags", sa.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'"))
    )
    op.create_check_constraint("chk_drug_warning_tags", "drug", f"warning_tags <@ ARRAY[{_WARNING_TAGS}]::text[]")

    # --- Phiếu hoàn tiền (chỉ thêm) ---------------------------------------------------------------
    op.create_table(
        "credit_note",
        sa.Column("credit_note_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("invoice_id", sa.Uuid(), nullable=False),
        sa.Column("credit_code", sa.String(50), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("refund_method", sa.String(30), nullable=False, server_default=sa.text("'Cash'")),
        sa.Column("issued_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoice.invoice_id"], name="fk_credit_note_invoice"),
        sa.ForeignKeyConstraint(["issued_by"], ["users.user_id"], name="credit_note_issued_by_fkey"),
        sa.UniqueConstraint("credit_code", name="uq_credit_note_code"),
        sa.CheckConstraint("total_amount > 0", name="credit_note_total_amount_check"),
        sa.CheckConstraint("refund_method IN ('Cash', 'BankingTransfer')", name="chk_credit_note_refund_method"),
    )
    op.create_index("idx_credit_note_invoice", "credit_note", ["invoice_id"])

    op.create_table(
        "credit_note_item",
        sa.Column("credit_item_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("credit_note_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_item_id", sa.Uuid(), nullable=False),
        sa.Column("item_name", sa.String(150), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(
            ["credit_note_id"], ["credit_note.credit_note_id"], name="credit_note_item_credit_note_id_fkey"
        ),
        sa.ForeignKeyConstraint(
            ["invoice_item_id"], ["invoice_item.invoice_item_id"], name="fk_credit_note_item_invoice_item"
        ),
        sa.CheckConstraint("quantity > 0", name="credit_note_item_quantity_check"),
        sa.CheckConstraint("unit_price >= 0", name="credit_note_item_unit_price_check"),
        sa.CheckConstraint("subtotal = quantity * unit_price", name="chk_credit_note_item_subtotal"),
    )
    op.create_index("idx_credit_note_item_invoice_item", "credit_note_item", ["invoice_item_id"])
    op.execute(_CREDIT_NOTE_FUNCTIONS)
    # ERD §6.2 quy tắc 1: quyền mặc định cấp cả UPDATE, bảng chỉ thêm phải tự thu hồi
    op.execute("REVOKE UPDATE ON credit_note, credit_note_item FROM medassist_app")

    # --- AI và tri thức ---------------------------------------------------------------------------
    op.add_column("ai_assessment_log", sa.Column("reasoning_input_hash", sa.CHAR(64)))
    op.create_index(
        "idx_ai_log_reasoning_hash",
        "ai_assessment_log",
        ["visit_id", "reasoning_input_hash"],
        postgresql_where=sa.text("run_type = 'Assessment' AND status = 'Completed'"),
    )
    op.add_column("symptom", sa.Column("body_region", sa.String(30)))
    op.create_check_constraint(
        "chk_symptom_body_region", "symptom", "body_region IS NULL OR body_region ~ '^[a-z0-9]+(_[a-z0-9]+)*$'"
    )
    op.add_column("triage_rule", sa.Column("trigger_when", JSONB()))
    op.create_check_constraint(
        "chk_triage_rule_trigger_when", "triage_rule", "trigger_when IS NULL OR jsonb_typeof(trigger_when) = 'object'"
    )
    op.execute(_INTEGRITY_VIEW.format(trees="jsonb_build_array(r.condition_logic, r.trigger_when)"))


_NO_PAIN_VAS_RULE = """
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM triage_rule WHERE status = 'Active'
               AND jsonb_path_exists(jsonb_build_array(condition_logic, trigger_when), 'lax $.**.vital ? (@ == "pain_vas")'))
    THEN
        RAISE EXCEPTION 'Còn luật Active dùng pain_vas: tắt luật trước khi hạ về 0010';
    END IF;
END $$;
"""


def downgrade() -> None:
    # Hạ về 0010 khi còn luật dùng pain_vas thì tập tri thức Active không còn khép kín (ERD §3)
    op.execute(_NO_PAIN_VAS_RULE)
    op.execute(_INTEGRITY_VIEW.format(trees="r.condition_logic"))
    op.drop_constraint("chk_triage_rule_trigger_when", "triage_rule", type_="check")
    op.drop_column("triage_rule", "trigger_when")
    op.drop_constraint("chk_symptom_body_region", "symptom", type_="check")
    op.drop_column("symptom", "body_region")
    op.drop_index("idx_ai_log_reasoning_hash", table_name="ai_assessment_log")
    op.drop_column("ai_assessment_log", "reasoning_input_hash")

    op.drop_table("credit_note_item")
    op.drop_table("credit_note")
    op.execute("DROP FUNCTION fn_credit_note_total_consistency()")
    op.execute("DROP FUNCTION fn_credit_note_item_guard()")

    op.drop_constraint("chk_drug_warning_tags", "drug", type_="check")
    op.drop_column("drug", "warning_tags")

    op.drop_constraint("chk_service_order_item_numeric", "service_order_item", type_="check")
    op.drop_constraint("chk_service_order_item_laterality", "service_order_item", type_="check")
    for column in ("abnormal_flag", "ref_high", "ref_low", "result_unit", "numeric_value", "laterality"):
        op.drop_column("service_order_item", column)
    op.drop_constraint("chk_diagnosis_laterality", "diagnosis", type_="check")
    op.drop_column("diagnosis", "laterality")

    # Khóa pain_vas phải rời dữ liệu trước khi hàm bỏ nó, nếu không CHECK sinh hiệu sai với dòng cũ
    op.execute("UPDATE visit SET vital_signs = vital_signs - 'pain_vas' WHERE vital_signs ? 'pain_vas'")
    op.execute(_VITAL_KEYS.format(extra=""))
    op.drop_index("idx_visit_follow_up", table_name="visit")
    op.drop_constraint("chk_visit_follow_up", "visit", type_="check")
    op.drop_constraint("chk_visit_exam_room", "visit", type_="check")
    op.drop_constraint("fk_visit_target_room", "visit", type_="foreignkey")
    op.drop_constraint("fk_visit_exam_room", "visit", type_="foreignkey")
    for column in ("follow_up_date", "target_room_id", "exam_room_id"):
        op.drop_column("visit", column)

    op.drop_table("room_session")
    # 0010 chỉ cho một bác sĩ đang hoạt động mỗi phòng: giữ người tạo sớm nhất, bỏ phòng của người còn lại
    op.execute(
        "UPDATE users u SET room_id = NULL FROM users o "
        "WHERE u.is_active AND o.is_active AND u.room_id = o.room_id AND u.user_id <> o.user_id "
        "AND (o.created_at, o.user_id) < (u.created_at, u.user_id)"
    )
    op.create_index(
        "uq_users_active_room",
        "users",
        ["room_id"],
        unique=True,
        postgresql_where=sa.text("is_active AND room_id IS NOT NULL"),
    )
    # 0010 chưa có vai trò dược sĩ: trả về Nurse, vai trò giữ kho và cấp phát trước 0011
    op.execute("UPDATE users SET role = 'Nurse' WHERE role = 'Pharmacist'")
    _role_check("'Physician','Nurse','Admin'")
