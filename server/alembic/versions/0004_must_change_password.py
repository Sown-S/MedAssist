"""Cờ bắt buộc đổi mật khẩu sau khi Admin tạo tài khoản hoặc đặt lại mật khẩu

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tài khoản đang có giữ false: mật khẩu hiện tại do chính chủ đặt hoặc tạo bằng scripts.create_user.
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False,
                                     server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
