"""Triệu chứng: tên ngắn, từ đồng nghĩa, nguồn phát hiện (bệnh nhân kể / khi khám) (ERD v2.2)

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("symptom", sa.Column("short_name", sa.String(30)))
    op.add_column("symptom", sa.Column("aliases", sa.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'")))
    op.add_column("symptom", sa.Column("detection", sa.String(10), nullable=False, server_default=sa.text("'both'")))
    op.create_check_constraint("chk_symptom_detection", "symptom", "detection IN ('reported', 'exam', 'both')")


def downgrade() -> None:
    op.drop_constraint("chk_symptom_detection", "symptom", type_="check")
    op.drop_column("symptom", "detection")
    op.drop_column("symptom", "aliases")
    op.drop_column("symptom", "short_name")
