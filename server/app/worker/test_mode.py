"""Bỏ timeout đánh giá khi test thủ công, vẫn gia hạn lease và hỗ trợ hủy."""

import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import timedelta

from sqlalchemy import func, update

from app.ai.test_mode import assessment_timeout_disabled, unlimited_assessment
from app.core.config import settings
from app.models import AiAssessmentLog


@asynccontextmanager
async def assessment_test_mode(assessment_id, attempt_count, session_factory):
    if not assessment_timeout_disabled():
        yield
        return

    owner = asyncio.current_task()

    async def renew():
        while True:
            await asyncio.sleep(min(30, settings.WORKER_LEASE_SECONDS / 3))
            try:
                with session_factory() as db:
                    result = db.execute(
                        update(AiAssessmentLog)
                        .where(AiAssessmentLog.assessment_id == assessment_id,
                               AiAssessmentLog.status == "Running",
                               AiAssessmentLog.attempt_count == attempt_count,
                               AiAssessmentLog.lease_until > func.now())
                        .values(lease_until=func.now() + timedelta(seconds=settings.WORKER_LEASE_SECONDS))
                    )
                    db.commit()
                    if result.rowcount != 1:
                        owner.cancel()
                        return
            except Exception:
                # Không tiếp tục ghi kết quả khi không còn xác nhận được quyền sở hữu job.
                owner.cancel()
                return

    token = unlimited_assessment.set(True)
    heartbeat = asyncio.create_task(renew())
    try:
        yield
    finally:
        heartbeat.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat
        unlimited_assessment.reset(token)
