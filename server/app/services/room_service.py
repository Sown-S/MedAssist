"""Phòng khám, phòng xét nghiệm (ERD v1.9 mục 2.1a). Mỗi phòng khám tối đa một bác sĩ đang hoạt động."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import Room, User
from app.schemas.room import RoomCreate, RoomUpdate
from app.services import audit_service as audit


def _physicians(db: Session) -> dict[uuid.UUID, dict]:
    rows = db.execute(select(User.room_id, User.user_id, User.full_name)
                      .where(User.room_id.is_not(None), User.is_active.is_(True))).all()
    return {room_id: {"user_id": user_id, "full_name": name} for room_id, user_id, name in rows}


def _out(room: Room, physicians: dict) -> dict:
    return {**{k: getattr(room, k) for k in ("room_id", "code", "name", "room_type", "is_active", "updated_at")},
            "physician": physicians.get(room.room_id)}


def list_rooms(db: Session, *, include_inactive: bool) -> list[dict]:
    stmt = select(Room).order_by(Room.code)
    if not include_inactive:
        stmt = stmt.where(Room.is_active.is_(True))
    physicians = _physicians(db)
    return [_out(r, physicians) for r in db.scalars(stmt)]


def create_room(db: Session, data: RoomCreate, actor: User) -> dict:
    if db.scalar(select(Room.room_id).where(Room.code == data.code)):
        raise AppError(409, "ROOM_CODE_TAKEN", f"Mã phòng '{data.code}' đã tồn tại",
                       [{"field": "code", "in": "body", "message": "Đã tồn tại"}])
    room = Room(code=data.code, name=data.name, room_type=data.room_type)
    db.add(room)
    db.flush()
    db.refresh(room)
    audit.record(db, action="CREATE", entity="room", entity_id=room.room_id, actor_id=actor.user_id,
                 new_values={"code": room.code, "name": room.name, "room_type": room.room_type})
    return _out(room, {})


def update_room(db: Session, room_id: uuid.UUID, data: RoomUpdate, actor: User) -> dict:
    room = db.scalar(select(Room).where(Room.room_id == room_id).with_for_update())
    if room is None:
        raise NotFoundError("Không tìm thấy phòng")
    changes = data.model_dump(exclude_unset=True)
    if changes.get("name", "") is None or changes.get("is_active", True) is None:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ")
    if changes.get("is_active") is False and room.room_id in _physicians(db):
        raise AppError(409, "ROOM_IN_USE", "Phòng đang có bác sĩ, chuyển bác sĩ sang phòng khác trước khi ngừng dùng")
    old = audit.snapshot(room, changes.keys())
    for k, v in changes.items():
        setattr(room, k, v)
    old_diff, new_diff = audit.diff_values(old, {k: getattr(room, k) for k in changes})
    if new_diff:
        room.updated_at = func.now()
        audit.record(db, action="UPDATE", entity="room", entity_id=room.room_id,
                     actor_id=actor.user_id, old_values=old_diff, new_values=new_diff)
    db.flush()
    db.refresh(room)
    return _out(room, _physicians(db))


def check_assignable(db: Session, room_id: uuid.UUID, user_id: uuid.UUID | None) -> None:
    """Phòng gán cho bác sĩ: phòng khám đang dùng và chưa có bác sĩ đang hoạt động khác."""
    room = db.get(Room, room_id)
    if room is None or not room.is_active or room.room_type != "Exam":
        raise AppError(422, "INVALID_ROOM", "Phòng không tồn tại, đã ngừng dùng hoặc không phải phòng khám",
                       [{"field": "room_id", "in": "body", "message": "Không hợp lệ"}])
    stmt = select(User.full_name).where(User.room_id == room_id, User.is_active.is_(True))
    if user_id:
        stmt = stmt.where(User.user_id != user_id)
    taken = db.scalar(stmt)
    if taken:
        raise AppError(409, "ROOM_TAKEN", f"Phòng {room.code} đã có bác sĩ {taken}",
                       [{"field": "room_id", "in": "body", "by": taken}])


def room_labels(db: Session, room_ids: set[uuid.UUID]) -> dict[uuid.UUID, tuple[str, str]]:
    if not room_ids:
        return {}
    return {r: (c, n) for r, c, n in db.execute(select(Room.room_id, Room.code, Room.name)
                                                .where(Room.room_id.in_(room_ids)))}
