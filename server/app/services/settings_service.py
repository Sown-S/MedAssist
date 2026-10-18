"""Tham số vận hành SYSTEM_SETTING (ERD v1.8 mục 2.22): Admin chỉnh, không cần redeploy.
Khóa chưa có dòng trong DB -> dùng mặc định trong code (settings_validators.SETTINGS)."""
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import SystemSetting, User
from app.services import audit_service as audit
from app.validation.settings_validators import SETTINGS, validate_setting


def get_value(db: Session, key: str) -> Any:
    """Giá trị đang dùng (DB nếu có, không thì mặc định). Dùng trong service khác."""
    if key not in SETTINGS:
        raise KeyError(key)
    row = db.get(SystemSetting, key)
    return row.value if row else validate_setting(key, SETTINGS[key][1])


def list_settings(db: Session) -> list[dict]:
    rows = {r.setting_key: r for r in db.scalars(select(SystemSetting))}
    out = []
    for key, (_, default, description) in SETTINGS.items():
        row = rows.get(key)
        out.append({"setting_key": key, "value": row.value if row else validate_setting(key, default),
                    "description": description, "is_default": row is None,
                    "updated_by": row.updated_by if row else None, "updated_at": row.updated_at if row else None})
    return out


def update_setting(db: Session, key: str, value: Any, actor: User) -> dict:
    new_value = validate_setting(key, value)          # 422 nếu sai kiểu, khóa lạ -> UNKNOWN_SETTING
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == key).with_for_update())
    old_value = row.value if row else validate_setting(key, SETTINGS[key][1])
    if row is None:
        row = SystemSetting(setting_key=key, value=new_value, description=SETTINGS[key][2],
                            updated_by=actor.user_id)
        db.add(row)
    elif row.value == new_value:
        return next(s for s in list_settings(db) if s["setting_key"] == key)
    else:
        row.value, row.updated_by, row.updated_at = new_value, actor.user_id, func.now()
    db.flush()
    audit.record(db, action="UPDATE", entity="system_setting", actor_id=actor.user_id,
                 old_values={"setting_key": key, "value": old_value},
                 new_values={"setting_key": key, "value": new_value})
    return next(s for s in list_settings(db) if s["setting_key"] == key)
