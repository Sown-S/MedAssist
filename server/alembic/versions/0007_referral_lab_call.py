"""Chuyển tuyến, đi xét nghiệm, mời bệnh nhân: cột mới của visit và danh mục bệnh viện (ERD v2.0)

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-31
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "referral_facility",
        sa.Column("facility_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("kcb_code", sa.String(10)),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("province", sa.String(100), nullable=False),
        sa.Column("address", sa.Text()),
        sa.Column("facility_type", sa.String(20), nullable=False),
        sa.Column("ownership", sa.String(20)),
        sa.Column("tech_level", sa.String(50)),
        sa.Column("source_doc", sa.String(255)),
        sa.Column("source_file", sa.String(255)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("kcb_code ~ '^[0-9A-Za-z]+$'", name="chk_referral_facility_kcb_code"),
        sa.CheckConstraint("facility_type IN ('Hospital','HealthCenter')", name="chk_referral_facility_type"),
        sa.CheckConstraint("ownership IN ('Public','Ministry','Private')", name="chk_referral_facility_ownership"),
    )
    # Danh sách của Sở Y tế không có mã KCB: định danh theo tỉnh + tên không dấu để seed chạy lại không tạo trùng
    op.create_index("uq_referral_facility_kcb_code", "referral_facility", ["kcb_code"], unique=True,
                    postgresql_where=sa.text("kcb_code IS NOT NULL"))
    op.execute("CREATE UNIQUE INDEX uq_referral_facility_identity ON referral_facility "
               "(province, lower(f_unaccent(name)))")
    op.execute("CREATE INDEX idx_referral_facility_name_trgm ON referral_facility "
               "USING gin (lower(f_unaccent(name)) gin_trgm_ops)")

    op.add_column("visit", sa.Column("outcome", sa.String(20)))
    op.add_column("visit", sa.Column("referral", JSONB()))
    op.add_column("visit", sa.Column("lab_out_at", sa.DateTime(timezone=True)))
    op.add_column("visit", sa.Column("called_at", sa.DateTime(timezone=True)))
    op.add_column("visit", sa.Column("called_by", sa.Uuid()))
    op.create_foreign_key("fk_visit_called_by", "visit", "users", ["called_by"], ["user_id"])
    op.create_check_constraint("chk_visit_outcome", "visit", "outcome IN ('Referred')")
    # Chuyển tuyến luôn kèm thông tin chuyển tuyến và kết thúc lượt khám
    op.create_check_constraint(
        "chk_visit_referral", "visit",
        "(outcome IS NULL) = (referral IS NULL) AND (outcome IS NULL OR status = 'Finished') "
        "AND (referral IS NULL OR jsonb_typeof(referral) = 'object')")
    op.create_check_constraint("chk_visit_lab_out", "visit", "lab_out_at IS NULL OR status = 'Examining'")
    op.create_check_constraint("chk_visit_called", "visit", "(called_at IS NULL) = (called_by IS NULL)")


def downgrade() -> None:
    for name in ("chk_visit_called", "chk_visit_lab_out", "chk_visit_referral", "chk_visit_outcome"):
        op.drop_constraint(name, "visit", type_="check")
    op.drop_constraint("fk_visit_called_by", "visit", type_="foreignkey")
    for col in ("called_by", "called_at", "lab_out_at", "referral", "outcome"):
        op.drop_column("visit", col)
    op.drop_table("referral_facility")   # chỉ mục của bảng bị xóa theo
