"""Phòng khám thay khoa phòng và ca trực: bác sĩ gắn cố định một phòng (ERD v1.9)

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-27
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

_OPEN = sa.text("ended_at IS NULL")


def upgrade() -> None:
    op.drop_table("doctor_duty")
    op.drop_index("idx_visit_department", table_name="visit")
    op.drop_constraint("fk_visit_department", "visit", type_="foreignkey")
    op.drop_column("visit", "department_id")
    op.drop_constraint("fk_users_department", "users", type_="foreignkey")
    op.drop_column("users", "department_id")
    op.drop_index("uq_department_active_room", table_name="department")
    op.drop_table("department")

    room = op.create_table(
        "room",
        sa.Column("room_id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("room_type", sa.String(10), nullable=False, server_default=sa.text("'Exam'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_room_code"),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9_-]+$'", name="chk_room_code_format"),
        sa.CheckConstraint("room_type IN ('Exam','Lab')", name="chk_room_type"),
    )
    op.bulk_insert(room, [
        {"code": "01", "name": "Phòng khám 01", "room_type": "Exam"},
        {"code": "02", "name": "Phòng khám 02", "room_type": "Exam"},
        {"code": "03", "name": "Phòng khám 03", "room_type": "Exam"},
        {"code": "04", "name": "Phòng xét nghiệm", "room_type": "Lab"},
    ])

    op.add_column("users", sa.Column("room_id", sa.Uuid()))
    op.create_foreign_key("fk_users_room", "users", "room", ["room_id"], ["room_id"])
    # Mỗi phòng khám tối đa một bác sĩ đang hoạt động; tài khoản bị khóa không giữ chỗ
    op.create_index("uq_users_active_room", "users", ["room_id"], unique=True,
                    postgresql_where=sa.text("is_active AND room_id IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("uq_users_active_room", table_name="users")
    op.drop_constraint("fk_users_room", "users", type_="foreignkey")
    op.drop_column("users", "room_id")
    op.drop_table("room")

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
    op.create_index("uq_department_active_room", "department", ["room"], unique=True,
                    postgresql_where=sa.text("is_active AND room IS NOT NULL"))
    op.add_column("users", sa.Column("department_id", sa.Uuid()))
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
    op.create_index("uq_doctor_duty_open_physician", "doctor_duty", ["physician_id"], unique=True, postgresql_where=_OPEN)
    op.create_index("uq_doctor_duty_open_department", "doctor_duty", ["department_id"], unique=True, postgresql_where=_OPEN)
    op.create_index("idx_doctor_duty_date", "doctor_duty", ["duty_date"])
