"""Khoa phòng, ca trực bác sĩ, thông tin nhân viên và khoa của lượt khám (ERD v1.9)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-27
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

_OPEN = sa.text("ended_at IS NULL")


def upgrade() -> None:
    op.create_table(
        "department",
        sa.Column("department_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("room", sa.String(30)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_department_code"),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9_-]+$'", name="chk_department_code_format"),
    )
    # Hai khoa đang hoạt động không dùng chung một phòng khám
    op.create_index("uq_department_active_room", "department", ["room"], unique=True,
                    postgresql_where=sa.text("is_active AND room IS NOT NULL"))

    op.add_column("users", sa.Column("staff_code", sa.String(20)))
    op.add_column("users", sa.Column("license_no", sa.String(30)))
    op.add_column("users", sa.Column("department_id", sa.Uuid()))
    op.create_unique_constraint("uq_users_staff_code", "users", ["staff_code"])
    op.create_foreign_key("fk_users_department", "users", "department", ["department_id"], ["department_id"])

    op.add_column("visit", sa.Column("department_id", sa.Uuid()))
    op.create_foreign_key("fk_visit_department", "visit", "department", ["department_id"], ["department_id"])
    op.create_index("idx_visit_department", "visit", ["department_id", "queue_date"])

    op.create_table(
        "doctor_duty",
        sa.Column("duty_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("physician_id", sa.Uuid(), sa.ForeignKey("users.user_id", name="fk_doctor_duty_physician"),
                  nullable=False),
        sa.Column("department_id", sa.Uuid(), sa.ForeignKey("department.department_id", name="fk_doctor_duty_department"),
                  nullable=False),
        sa.Column("duty_date", sa.Date(), nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("break_since", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="chk_doctor_duty_time"),
        sa.CheckConstraint("ended_at IS NULL OR break_since IS NULL", name="chk_doctor_duty_break_open"),
    )
    # Mỗi bác sĩ một ca đang mở; mỗi khoa (phòng) một bác sĩ đang trực
    op.create_index("uq_doctor_duty_open_physician", "doctor_duty", ["physician_id"], unique=True, postgresql_where=_OPEN)
    op.create_index("uq_doctor_duty_open_department", "doctor_duty", ["department_id"], unique=True, postgresql_where=_OPEN)
    op.create_index("idx_doctor_duty_date", "doctor_duty", ["duty_date"])


def downgrade() -> None:
    op.drop_table("doctor_duty")
    op.drop_index("idx_visit_department", table_name="visit")
    op.drop_constraint("fk_visit_department", "visit", type_="foreignkey")
    op.drop_column("visit", "department_id")
    op.drop_constraint("fk_users_department", "users", type_="foreignkey")
    op.drop_constraint("uq_users_staff_code", "users", type_="unique")
    op.drop_column("users", "department_id")
    op.drop_column("users", "license_no")
    op.drop_column("users", "staff_code")
    op.drop_index("uq_department_active_room", table_name="department")
    op.drop_table("department")
