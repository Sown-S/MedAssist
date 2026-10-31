"""Phòng khám, phòng xét nghiệm (ERD v1.9). Mọi vai trò xem; Admin thêm, sửa, ngừng dùng."""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models import User
from app.schemas.room import RoomCreate, RoomOut, RoomUpdate
from app.services import room_service

router = APIRouter(tags=["rooms"])

_admin = require_roles("Admin", audit_entity="room")


@router.get("/rooms", response_model=list[RoomOut])
def list_rooms(include_inactive: bool = Query(False), _: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    return room_service.list_rooms(db, include_inactive=include_inactive)


@router.post("/admin/rooms", response_model=RoomOut, status_code=201)
def create_room(body: RoomCreate, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    out = room_service.create_room(db, body, actor)
    db.commit()
    return out


@router.patch("/admin/rooms/{room_id}", response_model=RoomOut)
def update_room(room_id: uuid.UUID, body: RoomUpdate, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    out = room_service.update_room(db, room_id, body, actor)
    db.commit()
    return out
