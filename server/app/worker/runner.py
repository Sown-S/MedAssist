"""Vòng lặp worker: lấy việc (SKIP LOCKED + lease), chạy pipeline đánh giá hoặc trích xuất triệu
chứng của Huy, ghi kết quả; sweeper định kỳ thu hồi lease quá hạn. Hàng đợi LLM mặc định 1 ca:
mỗi worker xử lý tuần tự từng việc, Extraction được lấy trước Assessment.

Ngân sách thời gian tính từ lúc xếp hàng (queued_at), tối đa AI_ASSESSMENT_TIMEOUT_SECONDS — chờ
trong hàng đợi lâu thì phần LLM còn ít thời gian hơn, quá hạn thì trả Degraded/RuleOnly.
Trích xuất dùng ngân sách riêng EXTRACTION_TIMEOUT_SECONDS; hết giờ hay lỗi LLM thì trả danh sách rỗng.
"""
import asyncio
import datetime
import logging
import time
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.ai.extraction import feature_extractor
from app.ai.llm.errors import LLMConnectionError
from app.ai.llm.prompts import REASONING_PROMPT_VERSION
from app.ai.pipeline.graph import run_pipeline
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Patient, Visit
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
    if settings.LLM_PROVIDER == "fake":
        from app.ai.llm.fake_client import FAKE_MODEL_NAME, FakeLLMClient
        return FakeLLMClient(), FAKE_MODEL_NAME
    from app.ai.llm.client import LLMClient
    return (LLMClient(model=settings.OLLAMA_MODEL, base_url=settings.OLLAMA_BASE_URL,
                      keep_alive=settings.OLLAMA_KEEP_ALIVE), settings.OLLAMA_MODEL)


def _remaining_budget(queued_at: datetime.datetime, limit: float | None = None) -> float:
    waited = (datetime.datetime.now(datetime.UTC) - queued_at).total_seconds()
    return max(0.0, (settings.AI_ASSESSMENT_TIMEOUT_SECONDS if limit is None else limit) - waited)


def _known_identifiers(patient: Patient) -> list[str]:
    values = [patient.full_name, patient.phone, patient.id_number, patient.address,
              patient.date_of_birth.isoformat() if patient.date_of_birth else None]
    return [v for v in values if isinstance(v, str) and v.strip()]


async def _process_extraction(assessment_id, visit_id, queued_at, reader: DbKnowledgeReader, llm_client,
                              model_name: str | None, session_factory: Callable[[], Session]) -> None:
    started = time.monotonic()
    try:
        reader.refresh()
        with session_factory() as rdb:                    # validator Active chỉ đọc
            visit = rdb.get(Visit, visit_id)
            patient = rdb.get(Patient, visit.patient_id)
            gate = run_node1({"input_features": q.build_input_features(rdb, visit)}, reader)
            suggestions = await feature_extractor.extract_symptoms(
                visit.free_text_description or "", reader, llm_client, rdb, gate_state=gate,
                identifiers=_known_identifiers(patient),
                timeout_seconds=_remaining_budget(queued_at, feature_extractor.EXTRACTION_TIMEOUT_SECONDS))
            rdb.rollback()
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        log.exception("Trích xuất triệu chứng lỗi: %s", assessment_id)
        with session_factory() as wdb:
            q.write_failure(wdb, assessment_id, type(exc).__name__)
            wdb.commit()
        return
    with session_factory() as wdb:
        q.write_extraction(wdb, assessment_id, list(suggestions), model_name=model_name,
                           prompt_version=feature_extractor.EXTRACTION_PROMPT_VERSION,
                           latency_total_ms=int((time.monotonic() - started) * 1000))
        wdb.commit()


async def process_one(reader: DbKnowledgeReader, llm_client, model_name: str | None,
                      session_factory: Callable[[], Session] = SessionLocal) -> bool:
    """Xử lý tối đa một việc. Trả False khi hàng đợi rỗng."""
    with session_factory() as db:
        run = q.claim_next(db)
        if run is None:
            db.commit()
            return False
        assessment_id, queued_at, features = run.assessment_id, run.queued_at, dict(run.input_features or {})
        run_type, visit_id = run.run_type, run.visit_id
        db.commit()

    if run_type == "Extraction":
        await _process_extraction(assessment_id, visit_id, queued_at, reader, llm_client, model_name,
                                  session_factory)
        return True

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
