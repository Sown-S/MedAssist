"""Đánh dấu lượt đã Lưu & cấp số (đã có lần đánh giá) cho test không đi qua POST /assessment."""
from sqlalchemy import text

from app.core.database import engine


def save_intake(*visit_ids: str) -> None:
    with engine.begin() as conn:
        for vid in visit_ids:
            # Lùi giờ để không thành lần chạy mới nhất mà test khác tự tạo.
            conn.execute(text("INSERT INTO ai_assessment_log (visit_id, run_type, status, queued_at, completed_at) "
                              "VALUES (:v, 'Assessment', 'Skipped', now() - interval '1 day', "
                              "now() - interval '1 day')"), {"v": vid})
