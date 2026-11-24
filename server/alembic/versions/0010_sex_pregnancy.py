"""Bệnh, triệu chứng theo giới tính (applicable_sex); tình trạng mang thai ghi theo lượt khám (ERD v2.3)

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

_SEX_CHECK = "applicable_sex IN ('Any', 'Female', 'Male')"


def upgrade() -> None:
    for table in ("condition", "symptom"):
        op.add_column(
            table, sa.Column("applicable_sex", sa.String(10), nullable=False, server_default=sa.text("'Any'"))
        )
        op.create_check_constraint(f"chk_{table}_applicable_sex", table, _SEX_CHECK)
    op.add_column("visit", sa.Column("is_pregnant", sa.Boolean()))
    # Giá trị cũ trên hồ sơ không biết thuộc lần khám nào: bỏ, hỏi lại ở lượt sau.
    op.execute("UPDATE patient SET medical_history = medical_history - 'is_pregnant' WHERE medical_history ? 'is_pregnant'")


def downgrade() -> None:
    op.drop_column("visit", "is_pregnant")
    for table in ("symptom", "condition"):
        op.drop_constraint(f"chk_{table}_applicable_sex", table, type_="check")
        op.drop_column(table, "applicable_sex")
