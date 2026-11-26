"""ROOM_SESSION — ca làm việc của bác sĩ tại một phòng khám (ERD §2.1b). Ca mở: ended_at NULL,
mỗi phòng và mỗi bác sĩ tối đa một ca mở (chỉ mục duy nhất từng phần)."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

ENDED_REASONS = ("EndShift", "TakenOver", "AccountLocked")


class RoomSession(Base):
    __tablename__ = "room_session"
    __table_args__ = (
        ForeignKeyConstraint(["room_id"], ["room.room_id"], name="fk_room_session_room"),
        ForeignKeyConstraint(["physician_id"], ["users.user_id"], name="fk_room_session_physician"),
        ForeignKeyConstraint(["ended_by"], ["users.user_id"], name="room_session_ended_by_fkey"),
        CheckConstraint(
            "(ended_at IS NULL) = (ended_reason IS NULL) AND (ended_at IS NULL) = (ended_by IS NULL) "
            "AND COALESCE(ended_reason IN ('EndShift', 'TakenOver', 'AccountLocked'), true) "
            "AND COALESCE(ended_at >= started_at, true)",
            name="chk_room_session_end",
        ),
        Index("uq_room_session_open_room", "room_id", unique=True, postgresql_where=text("ended_at IS NULL")),
        Index("uq_room_session_open_physician", "physician_id", unique=True, postgresql_where=text("ended_at IS NULL")),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    room_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    physician_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_reason: Mapped[str | None] = mapped_column(String(15))
    ended_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
