"""Vòng lặp worker: lấy việc (SKIP LOCKED + lease), chạy pipeline đánh giá hoặc trích xuất, ghi kết quả;
sweeper định kỳ thu hồi lease quá hạn. Ngân sách thời gian tính từ queued_at.
Chi tiết: docs/thiet-ke-backend.md §2.
"""

import asyncio
import datetime
import logging
import time
import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ai.extraction import feature_extractor
from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction.dispatch import ExtractionOptions, run_extraction
from app.ai.extraction.phrase_selector import SelectionResult
from app.ai.llm.errors import LLMConnectionError
from app.ai.llm.prompts import REASONING_PROMPT_VERSION
from app.ai.pipeline.graph import run_pipeline
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.snapshot_reader import SnapshotReader
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AiAssessmentLog, Patient, Visit
from app.services import ai_queue_service as q
from app.services import audit_service
from app.services.knowledge_reader import DbKnowledgeReader
from app.worker.test_mode import assessment_test_mode

log = logging.getLogger("medassist.worker")
_phrase_index_cache = CandidateIndexCache()


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

    return (
        LLMClient(
            model=settings.OLLAMA_MODEL, base_url=settings.OLLAMA_BASE_URL, keep_alive=settings.OLLAMA_KEEP_ALIVE
        ),
        settings.OLLAMA_MODEL,
    )


def _remaining_budget(queued_at: datetime.datetime, limit: float | None = None) -> float:
    target = float(settings.AI_ASSESSMENT_TIMEOUT_SECONDS if limit is None else limit)
    if target <= 0:
        return 0.0
    # Tính cả thời gian chờ; lease không được cấp lại ngân sách đã hết.
    # Nếu đồng hồ lệch khiến queued_at ở tương lai, không vượt ngân sách gốc.
    waited = max(0.0, (datetime.datetime.now(datetime.UTC) - queued_at).total_seconds())
    return max(0.0, target - waited)


def _known_identifiers(patient: Patient) -> list[str]:
    values = [
        patient.full_name,
        patient.phone,
        patient.id_number,
        patient.address,
        patient.date_of_birth.isoformat() if patient.date_of_birth else None,
    ]
    return [v for v in values if isinstance(v, str) and v.strip()]


async def _process_extraction(
    assessment_id,
    visit_id,
    queued_at,
    reader: DbKnowledgeReader,
    llm_client,
    model_name: str | None,
    session_factory: Callable[[], Session],
    *,
    attempt_count: int | None = None,
) -> None:
    options = ExtractionOptions(
        strategy=getattr(settings, "AI_EXTRACTION_STRATEGY", "legacy"),
        per_phrase_limit=getattr(settings, "AI_EXTRACTION_CANDIDATES_PER_PHRASE", 4),
    )
    if options.strategy == "phrases":
        await _process_phrase_extraction(
            assessment_id,
            visit_id,
            queued_at,
            reader,
            llm_client,
            model_name,
            session_factory,
            attempt_count=attempt_count,
            options=options,
        )
        return
    started = time.monotonic()
    try:
        reader.refresh()
        with session_factory() as rdb:  # validator Active chỉ đọc
            visit = rdb.get(Visit, visit_id)
            patient = rdb.get(Patient, visit.patient_id)
            gate = run_node1({"input_features": q.build_input_features(rdb, visit)}, reader)
            result = await run_extraction(
                visit.free_text_description or "",
                reader,
                llm_client,
                rdb,
                gate_state=gate,
                identifiers=_known_identifiers(patient),
                timeout_seconds=_remaining_budget(queued_at, feature_extractor.EXTRACTION_TIMEOUT_SECONDS),
                options=options,
            )
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
        q.write_extraction(
            wdb,
            assessment_id,
            list(result.suggestions),
            model_name=model_name,
            prompt_version=result.prompt_version,
            latency_total_ms=int((time.monotonic() - started) * 1000),
        )
        wdb.commit()


async def _process_phrase_extraction(
    assessment_id,
    visit_id,
    queued_at,
    reader,
    llm_client,
    model_name,
    session_factory,
    *,
    attempt_count,
    options,
) -> None:
    """Đường opt-in; ghim snapshot, lỗi kỹ thuật thành Failed thay vì Completed []."""
    started = time.monotonic()
    pinned = None
    gate = None
    try:
        pinned = SnapshotReader(reader.refresh())
        with session_factory() as rdb:
            visit = rdb.get(Visit, visit_id)
            patient = rdb.get(Patient, visit.patient_id)
            gate = run_node1({"input_features": q.build_input_features(rdb, visit)}, pinned)
            result = await run_extraction(
                visit.free_text_description or "",
                pinned,
                llm_client,
                rdb,
                gate_state=gate,
                identifiers=_known_identifiers(patient),
                timeout_seconds=_remaining_budget(queued_at, feature_extractor.EXTRACTION_TIMEOUT_SECONDS),
                cache=_phrase_index_cache,
                options=options,
            )
            rdb.rollback()
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        # Chỉ ghi loại lỗi; traceback/str(exc) có thể chứa dữ liệu đầu vào.
        result = SelectionResult(False, type(exc).__name__)
        log.warning("Trích xuất theo cụm lỗi: %s (%s)", assessment_id, type(exc).__name__)
    with session_factory() as wdb:
        # Khóa bản ghi và kiểm attempt để kết quả cũ không ghi đè lần đã retry.
        run = wdb.get(AiAssessmentLog, assessment_id, with_for_update=True)
        if run is None or run.status != "Running" or (attempt_count is not None and run.attempt_count != attempt_count):
            wdb.rollback()
            return
        if result.completed and _remaining_budget(queued_at, feature_extractor.EXTRACTION_TIMEOUT_SECONDS) <= 0:
            result = SelectionResult(False, "EXTRACTION_TIMEOUT")
        run.model_name, run.prompt_version = model_name, result.prompt_version
        run.validation_result = {"valid": result.completed, "reason": result.failure_code}
        run.llm_output_raw = None
        run.latency_total_ms = int((time.monotonic() - started) * 1000)
        if gate is not None:
            run.rule_hits = q._rule_record(gate["rule_hits"], gate["complete_now"], pinned)
        if pinned is not None:
            release_id = pinned.active_release().get("release_id")
            if release_id:
                run.knowledge_release_id = uuid.UUID(str(release_id))
        if result.completed:
            q.write_extraction(
                wdb,
                assessment_id,
                list(result.suggestions),
                model_name=model_name,
                prompt_version=result.prompt_version,
                latency_total_ms=run.latency_total_ms,
            )
        else:
            code = result.failure_code or "EXTRACTION_INCOMPLETE"
            if code == "RED_FLAG_SKIPPED":
                run.status, run.error_detail = "Skipped", code
                run.lease_until, run.completed_at = None, func.now()
            else:
                q.write_failure(wdb, assessment_id, code)
            run.candidates = []
            audit_service.record(
                wdb,
                action="AI_ASSESSMENT",
                entity="visit",
                entity_id=visit_id,
                actor_id=run.triggered_by or q.SYSTEM_USER_ID,
                new_values={
                    "assessment_id": str(assessment_id),
                    "run_type": "Extraction",
                    "status": run.status,
                    "reason": code,
                    "model_name": model_name,
                    "prompt_version": result.prompt_version,
                },
            )
        wdb.commit()


async def process_one(
    reader: DbKnowledgeReader, llm_client, model_name: str | None, session_factory: Callable[[], Session] = SessionLocal
) -> bool:
    """Xử lý tối đa một việc. Trả False khi hàng đợi rỗng."""
    with session_factory() as db:
        run = q.claim_next(db)
        if run is None:
            db.commit()
            return False
        assessment_id, queued_at, features = run.assessment_id, run.queued_at, dict(run.input_features or {})
        run_type, visit_id = run.run_type, run.visit_id
        attempt_count = run.attempt_count
        db.commit()

    if run_type == "Extraction":
        await _process_extraction(
            assessment_id,
            visit_id,
            queued_at,
            reader,
            llm_client,
            model_name,
            session_factory,
            attempt_count=attempt_count,
        )
        return True

    started = time.monotonic()
    marks: dict[str, float] = {}

    async def on_preliminary(state: dict) -> None:
        marks["preliminary"] = time.monotonic()
        with session_factory() as wdb:
            q.write_preliminary(wdb, assessment_id, state)
            wdb.commit()

    try:
        reader.refresh()  # một snapshot nhất quán cho cả lần chạy
        with session_factory() as rdb:  # Node 4 chỉ đọc (kiểm mã Active)
            async with assessment_test_mode(assessment_id, attempt_count, session_factory):
                final = await run_pipeline(
                    {"input_features": features},
                    reader,
                    llm_client,
                    rdb,
                    timeout_seconds=_remaining_budget(queued_at),
                    on_preliminary=on_preliminary,
                )
            rdb.rollback()
    except asyncio.CancelledError:
        raise  # để lease hết hạn, sweeper thu hồi
    except Exception as exc:  # lỗi hạ tầng / lập trình -> Failed
        log.exception("Đánh giá AI lỗi: %s", assessment_id)
        with session_factory() as wdb:
            q.write_failure(wdb, assessment_id, type(exc).__name__)
            wdb.commit()
        return True

    ended = time.monotonic()
    prelim = marks.get("preliminary")
    with session_factory() as wdb:
        q.write_result(
            wdb,
            assessment_id,
            dict(final),
            reader=reader,
            model_name=model_name,
            prompt_version=REASONING_PROMPT_VERSION,
            latency_phase1_ms=int((prelim - started) * 1000) if prelim else None,
            latency_llm_ms=int((ended - prelim) * 1000) if prelim and final.get("mode") == "Full" else None,
            latency_total_ms=int((ended - started) * 1000),
        )
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
        except Exception:  # DB tạm mất: không để worker chết
            log.exception("Vòng lặp worker lỗi, thử lại sau")
            worked = False
        if not worked:
            try:
                await asyncio.wait_for(stop.wait(), timeout=settings.WORKER_POLL_SECONDS)
            except TimeoutError:
                pass
