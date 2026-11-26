"""USERS (ERD §2.1)."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

ROLES = ("Physician", "Nurse", "Pharmacist", "Admin")
# Tài khoản do Alembic 0002 tạo (db/03_bootstrap.sql): người thực hiện của script, không đăng nhập được
SYSTEM_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('Physician','Nurse','Pharmacist','Admin')", name="users_role_check"),
        UniqueConstraint("staff_code", name="uq_users_staff_code"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    # Alembic 0004: mật khẩu do Admin đặt (tạo mới, đặt lại) phải được chủ tài khoản đổi trước khi dùng hệ thống
    must_change_password: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    staff_code: Mapped[str | None] = mapped_column(String(20))
    license_no: Mapped[str | None] = mapped_column(String(30))
    # Phòng mặc định gợi ý khi nhận ca; phòng đang ngồi là ca mở trong room_session (ERD §2.1)
    room_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("room.room_id", name="fk_users_room"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
