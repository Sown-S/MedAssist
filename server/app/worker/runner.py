"""Vòng lặp worker: lấy việc (SKIP LOCKED + lease), chạy pipeline của Huy, ghi kết quả; sweeper
định kỳ thu hồi lease quá hạn. Hàng đợi LLM mặc định 1 ca: mỗi worker xử lý tuần tự từng việc.

Ngân sách thời gian tính từ lúc xếp hàng (queued_at), tối đa AI_ASSESSMENT_TIMEOUT_SECONDS — chờ
trong hàng đợi lâu thì phần LLM còn ít thời gian hơn, quá hạn thì trả Degraded/RuleOnly.
"""
import asyncio
import datetime
import logging
import time
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.ai.llm.errors import LLMConnectionError
from app.ai.llm.prompts import REASONING_PROMPT_VERSION
from app.ai.pipeline.graph import run_pipeline
from app.core.config import settings
from app.core.database import SessionLocal
from app.services import ai_queue_service as q
from app.services.knowledge_reader import DbKnowledgeReader

log = logging.getLogger("medassist.worker")


class DisabledLLMClient:
    """LLM_PROVIDER=none: luôn báo lỗi kết nối -> pipeline trả Degraded/RuleOnly (Node 2 tất định)."""

    async def generate_json(self, *, prompt: str, schema: Any, timeout_seconds: float) -> dict[str, Any]:
        raise LLMConnectionError("LLM disabled (LLM_PROVIDER=none)")


def make_llm_client():
    if settings.LLM_PROVIDER == "none":
        return DisabledLLMClient(), None
    from app.ai.llm.ollama_client import OllamaClient
    return OllamaClient(model=settings.OLLAMA_MODEL, base_url=settings.OLLAMA_BASE_URL), settings.OLLAMA_MODEL


def _remaining_budget(queued_at: datetime.datetime) -> float:
    waited = (datetime.datetime.now(datetime.UTC) - queued_at).total_seconds()
    return max(0.0, settings.AI_ASSESSMENT_TIMEOUT_SECONDS - waited)


async def process_one(reader: DbKnowledgeReader, llm_client, model_name: str | None,
                      session_factory: Callable[[], Session] = SessionLocal) -> bool:
    """Xử lý tối đa một việc. Trả False khi hàng đợi rỗng."""
    with session_factory() as db:
        run = q.claim_next(db)
        if run is None:
            db.commit()
            return False
        assessment_id, queued_at, features = run.assessment_id, run.queued_at, dict(run.input_features or {})
        db.commit()

    started = time.monotonic()
    marks: dict[str, float] = {}

    async def on_preliminary(state: dict) -> None:
        marks["preliminary"] = time.monotonic()
        with session_factory() as wdb:
            q.write_preliminary(wdb, assessment_id, state)
            wdb.commit()

    try:
        reader.refresh()                                  # một snapshot nhất quán cho cả lần chạy
        with session_factory() as rdb:                    # Node 4 chỉ đọc (kiểm mã Active)
            final = await run_pipeline({"input_features": features}, reader, llm_client, rdb,
                                       timeout_seconds=_remaining_budget(queued_at),
                                       on_preliminary=on_preliminary)
            rdb.rollback()
    except asyncio.CancelledError:
        raise                                             # để lease hết hạn, sweeper thu hồi
    except Exception as exc:                              # lỗi hạ tầng / lập trình -> Failed
        log.exception("Đánh giá AI lỗi: %s", assessment_id)
        with session_factory() as wdb:
            q.write_failure(wdb, assessment_id, type(exc).__name__)
            wdb.commit()
        return True

    ended = time.monotonic()
    prelim = marks.get("preliminary")
    with session_factory() as wdb:
        q.write_result(wdb, assessment_id, dict(final), reader=reader, model_name=model_name,
                       prompt_version=REASONING_PROMPT_VERSION,
                       latency_phase1_ms=int((prelim - started) * 1000) if prelim else None,
                       latency_llm_ms=int((ended - prelim) * 1000) if prelim and final.get("mode") == "Full" else None,
                       latency_total_ms=int((ended - started) * 1000))
        wdb.commit()
    return True


def sweep_once(session_factory: Callable[[], Session] = SessionLocal) -> dict[str, int]:
    with session_factory() as db:
        result = q.sweep_expired(db)
        db.commit()
    if result["requeued"] or result["failed"]:
        log.warning("Sweeper: %s", result)
    return result


async def run_forever(stop: asyncio.Event | None = None) -> None:
    stop = stop or asyncio.Event()
    reader = DbKnowledgeReader()
    llm_client, model_name = make_llm_client()
    log.info("Worker AI bắt đầu (LLM_PROVIDER=%s)", settings.LLM_PROVIDER)
    next_sweep = 0.0
    while not stop.is_set():
        if time.monotonic() >= next_sweep:
            sweep_once()
            next_sweep = time.monotonic() + settings.WORKER_SWEEP_SECONDS
        try:
            worked = await process_one(reader, llm_client, model_name)
        except Exception:                                 # DB tạm mất: không để worker chết
            log.exception("Vòng lặp worker lỗi, thử lại sau")
            worked = False
        if not worked:
            try:
                await asyncio.wait_for(stop.wait(), timeout=settings.WORKER_POLL_SECONDS)
            except TimeoutError:
                pass
