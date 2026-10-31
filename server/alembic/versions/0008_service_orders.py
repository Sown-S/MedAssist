"""Danh mục dịch vụ, gói khám, phiếu chỉ định cận lâm sàng và kết quả; hóa đơn tự lấy dòng từ chỉ định (ERD v2.1)

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-31
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

_SAME_VISIT_V18 = """
CREATE OR REPLACE FUNCTION fn_invoice_item_same_visit()
RETURNS TRIGGER AS $$
DECLARE inv_visit UUID; rx_visit UUID;
BEGIN
    IF NEW.prescription_item_id IS NULL THEN RETURN NEW; END IF;
    SELECT visit_id INTO inv_visit FROM invoice WHERE invoice_id = NEW.invoice_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT p.visit_id INTO rx_visit
    FROM prescription_item i JOIN prescription p ON p.prescription_id = i.prescription_id
    WHERE i.item_id = NEW.prescription_item_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF rx_visit <> inv_visit THEN
        RAISE EXCEPTION 'Dòng thuốc % thuộc lượt khám khác với hóa đơn %', NEW.prescription_item_id, NEW.invoice_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

# Dòng hóa đơn lấy từ phiếu chỉ định phải cùng lượt khám với hóa đơn, như dòng thuốc (vá 03/10)
_SAME_VISIT_V21 = """
CREATE OR REPLACE FUNCTION fn_invoice_item_same_visit()
RETURNS TRIGGER AS $$
DECLARE inv_visit UUID; src_visit UUID;
BEGIN
    IF NEW.prescription_item_id IS NULL AND NEW.service_order_id IS NULL THEN RETURN NEW; END IF;
    SELECT visit_id INTO inv_visit FROM invoice WHERE invoice_id = NEW.invoice_id;
    IF NOT FOUND THEN RETURN NEW; END IF;          -- nhường khóa ngoại báo 23503
    IF NEW.prescription_item_id IS NOT NULL THEN
        SELECT p.visit_id INTO src_visit
        FROM prescription_item i JOIN prescription p ON p.prescription_id = i.prescription_id
        WHERE i.item_id = NEW.prescription_item_id;
        IF FOUND AND src_visit <> inv_visit THEN
            RAISE EXCEPTION 'Dòng thuốc % thuộc lượt khám khác với hóa đơn %', NEW.prescription_item_id, NEW.invoice_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF NEW.service_order_id IS NOT NULL THEN
        SELECT visit_id INTO src_visit FROM service_order WHERE order_id = NEW.service_order_id;
        IF FOUND AND src_visit <> inv_visit THEN
            RAISE EXCEPTION 'Phiếu chỉ định % thuộc lượt khám khác với hóa đơn %', NEW.service_order_id, NEW.invoice_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""


def _trigger(columns: str) -> None:
    op.execute("DROP TRIGGER trg_invoice_item_same_visit ON invoice_item")
    op.execute(f"CREATE TRIGGER trg_invoice_item_same_visit BEFORE INSERT OR UPDATE OF {columns} ON invoice_item "
               "FOR EACH ROW EXECUTE FUNCTION fn_invoice_item_same_visit()")


def upgrade() -> None:
    op.create_table(
        "service",
        sa.Column("service_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("group_key", sa.String(30), nullable=False),
        sa.Column("unit", sa.String(30)),
        sa.Column("price", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("ref_low", sa.Numeric(12, 3)),
        sa.Column("ref_high", sa.Numeric(12, 3)),
        sa.Column("ref_text", sa.String(100)),
        sa.Column("sample", sa.String(20)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9_-]+$'", name="chk_service_code_format"),
        sa.CheckConstraint("kind IN ('Service','Lab')", name="chk_service_kind"),
        sa.CheckConstraint("price >= 0", name="service_price_check"),
        sa.CheckConstraint("ref_low IS NULL OR ref_high IS NULL OR ref_low <= ref_high", name="chk_service_ref_range"),
    )
    op.create_index("uq_service_code", "service", ["code"], unique=True)

    op.create_table(
        "service_package",
        sa.Column("package_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        # Danh sách [{service_id, quantity}]: app không có quyền DELETE nên sửa gói = ghi lại cả danh sách
        sa.Column("items", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9_-]+$'", name="chk_service_package_code_format"),
        sa.CheckConstraint("price >= 0", name="service_package_price_check"),
        sa.CheckConstraint("jsonb_typeof(items) = 'array'", name="chk_service_package_items"),
    )
    op.create_index("uq_service_package_code", "service_package", ["code"], unique=True)

    op.create_table(
        "service_order",
        sa.Column("order_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("visit_id", sa.Uuid(), nullable=False),
        sa.Column("ordered_by", sa.Uuid(), nullable=False),
        sa.Column("ordered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("package_id", sa.Uuid()),
        sa.Column("package_name", sa.String(150)),
        sa.Column("package_price", sa.Numeric(12, 2)),
        sa.Column("diagnosis", sa.Text()),
        sa.Column("note", sa.Text()),
        sa.Column("conclusion", sa.Text()),
        sa.ForeignKeyConstraint(["visit_id"], ["visit.visit_id"], name="service_order_visit_id_fkey"),
        sa.ForeignKeyConstraint(["ordered_by"], ["users.user_id"], name="service_order_ordered_by_fkey"),
        sa.ForeignKeyConstraint(["package_id"], ["service_package.package_id"], name="fk_service_order_package"),
        sa.CheckConstraint("(package_id IS NULL) = (package_name IS NULL) AND (package_id IS NULL) = (package_price IS NULL)",
                           name="chk_service_order_package"),
        sa.CheckConstraint("package_price IS NULL OR package_price >= 0", name="service_order_package_price_check"),
    )
    op.create_index("idx_service_order_visit", "service_order", ["visit_id", "ordered_at"])

    op.create_table(
        "service_order_item",
        sa.Column("item_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid()),
        sa.Column("item_name", sa.String(150), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("unit_price", sa.Numeric(12, 2)),
        sa.Column("in_package", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(12), nullable=False, server_default=sa.text("'Ordered'")),
        sa.Column("result", sa.Text()),
        sa.Column("result_by", sa.Uuid()),
        sa.Column("result_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_by", sa.Uuid()),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("cancel_reason", sa.Text()),
        sa.ForeignKeyConstraint(["order_id"], ["service_order.order_id"], name="service_order_item_order_id_fkey"),
        sa.ForeignKeyConstraint(["service_id"], ["service.service_id"], name="fk_service_order_item_service"),
        sa.ForeignKeyConstraint(["result_by"], ["users.user_id"], name="service_order_item_result_by_fkey"),
        sa.ForeignKeyConstraint(["cancelled_by"], ["users.user_id"], name="service_order_item_cancelled_by_fkey"),
        sa.CheckConstraint("quantity > 0", name="service_order_item_quantity_check"),
        sa.CheckConstraint("status IN ('Ordered','Cancelled')", name="chk_service_order_item_status"),
        # Ngoài danh mục thì không có giá (quầy thêm tay) và không thuộc gói
        sa.CheckConstraint("(service_id IS NULL) = (unit_price IS NULL) AND (service_id IS NOT NULL OR NOT in_package) "
                           "AND (unit_price IS NULL OR unit_price >= 0)", name="chk_service_order_item_price"),
        sa.CheckConstraint("(result IS NULL) = (result_at IS NULL) AND (result IS NULL) = (result_by IS NULL)",
                           name="chk_service_order_item_result"),
        sa.CheckConstraint("(status = 'Cancelled') = (cancelled_at IS NOT NULL) "
                           "AND (status = 'Cancelled') = (cancelled_by IS NOT NULL) "
                           "AND (status = 'Cancelled') = (cancel_reason IS NOT NULL)",
                           name="chk_service_order_item_cancel"),
    )
    op.create_index("idx_service_order_item_order", "service_order_item", ["order_id"])

    op.add_column("invoice_item", sa.Column("service_order_id", sa.Uuid()))
    op.create_foreign_key("fk_invoice_item_service_order", "invoice_item", "service_order",
                          ["service_order_id"], ["order_id"])
    op.create_check_constraint("chk_invoice_item_order", "invoice_item",
                               "service_order_id IS NULL OR item_type = 'Paraclinical'")
    op.create_index("idx_invoice_item_order", "invoice_item", ["service_order_id"])
    op.execute(_SAME_VISIT_V21)
    _trigger("invoice_id, prescription_item_id, service_order_id")


def downgrade() -> None:
    _trigger("invoice_id, prescription_item_id")
    op.execute(_SAME_VISIT_V18)
    op.drop_index("idx_invoice_item_order", table_name="invoice_item")
    op.drop_constraint("chk_invoice_item_order", "invoice_item", type_="check")
    op.drop_constraint("fk_invoice_item_service_order", "invoice_item", type_="foreignkey")
    op.drop_column("invoice_item", "service_order_id")
    for table in ("service_order_item", "service_order", "service_package", "service"):
        op.drop_table(table)
