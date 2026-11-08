"""Trạng thái AI cho /health. AI lỗi vẫn trả 200: hệ thống còn xếp hạng theo luật (RuleOnly)."""

import datetime
import threading
import time

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.models import AiAssessmentLog

logger = get_logger("health")

OLLAMA_TIMEOUT_SECONDS = 1.5
# Nhiều máy client cùng hỏi /health định kỳ: cache để không gọi Ollama mỗi lần.
OLLAMA_CACHE_SECONDS = 10

_lock = threading.Lock()
_cache: tuple[float, bool, str, str | None] | None = None


def _check_ollama() -> tuple[bool, str, str | None]:
    global _cache
    with _lock:
        if _cache and time.monotonic() - _cache[0] < OLLAMA_CACHE_SECONDS:
            return _cache[1:]
    try:
        r = httpx.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags", timeout=OLLAMA_TIMEOUT_SECONDS)
        r.raise_for_status()
        names = {m.get("name") or m.get("model") for m in r.json().get("models", [])}
        result = (
            (True, "Ollama sẵn sàng", None)
            if settings.OLLAMA_MODEL in names
            else (False, "Ollama chưa có model", "no_model")
        )
    except Exception:
        logger.warning("Health check: không gọi được Ollama")
        result = (False, "Không kết nối được Ollama", "unreachable")
    with _lock:
        _cache = (time.monotonic(), *result)
    return result


def _stuck_queue(db: Session) -> bool:
    """Việc Queued quá hạn đánh giá mà chưa ai nhận: worker đã dừng."""
    oldest = db.scalar(select(func.min(AiAssessmentLog.queued_at)).where(AiAssessmentLog.status == "Queued"))
    if oldest is None:
        return False
    waited = (datetime.datetime.now(datetime.UTC) - oldest).total_seconds()
    return waited > settings.AI_ASSESSMENT_TIMEOUT_SECONDS


def ai_status(db: Session) -> dict:
    """reason (khi ok = false): disabled | unreachable | no_model | worker_stopped.
    Client dựa vào mã, không dò detail."""
    if settings.LLM_PROVIDER == "none":
        ok, detail, reason = False, "LLM đang tắt, chỉ xếp hạng theo luật", "disabled"
    elif settings.LLM_PROVIDER == "fake":
        ok, detail, reason = True, "LLM giả lập", None
    else:
        ok, detail, reason = _check_ollama()
    if _stuck_queue(db):
        ok, detail, reason = False, "Worker AI không xử lý hàng đợi", "worker_stopped"
    return {"ok": ok, "detail": detail, "reason": reason}


def reset_cache() -> None:
    global _cache
    with _lock:
        _cache = None
