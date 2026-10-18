"""Claim, thực thi và thu hồi lease cho hàng đợi AI.

Worker không giữ row lock trong lúc gọi LLM. Claim được commit ngay, sau đó job chạy
trong một session mới với lease 120 giây. Mọi trạng thái kết thúc và audit tương ứng
được commit cùng transaction; nội dung exception, prompt và PII không được ghi lại.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.ai.extraction import feature_extractor
from app.ai.interfaces import KnowledgeReader, LLMClient
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.models.ai_assessment_log import AiAssessmentLog
from app.models.patient import Patient
from app.models.user import SYSTEM_USER_ID
from app.models.visit import Visit
from app.services import assessment_service, audit_service

LEASE_SECONDS = 120
SWEEP_INTERVAL_SECONDS = 30
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_LLM_CONCURRENCY = 1
_SAFE_ERROR_CODE = "WORKER_EXECUTION_FAILED"


def _now() -> datetime:
    return datetime.now(UTC)


def claim_next_job(db: Session, *, now: datetime | None = None) -> AiAssessmentLog | None:
    """Khóa và claim job Queued cũ nhất; caller commit ngay để công bố lease."""
    claimed_at = now or _now()
    log = db.scalar(
        select(AiAssessmentLog)
        .where(AiAssessmentLog.status == "Queued")
        .order_by(AiAssessmentLog.queued_at.asc(), AiAssessmentLog.assessment_id.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if log is None:
        return None
    log.status = "Running"
    log.started_at = claimed_at
    log.lease_until = claimed_at + timedelta(seconds=LEASE_SECONDS)
    log.completed_at = None
    db.flush()
    return log


def _audit_failure(db: Session, log: AiAssessmentLog, visit: Visit | None) -> None:
    audit_service.record(
        db,
        action="AI_ASSESSMENT",
        entity="visit",
        entity_id=log.visit_id,
        actor_id=log.triggered_by or SYSTEM_USER_ID,
        new_values={
            "assessment_id": log.assessment_id,
            "run_type": log.run_type,
            "status": "Failed",
            "ai_status": visit.ai_status if visit is not None else None,
            "error_code": _SAFE_ERROR_CODE,
        },
    )


def _mark_failed(
    db: Session,
    log: AiAssessmentLog,
    *,
    failed_at: datetime,
) -> None:
    log.status = "Failed"
    log.completed_at = failed_at
    log.lease_until = None
    log.error_detail = _SAFE_ERROR_CODE
    visit = db.get(Visit, log.visit_id)
    if visit is not None and log.run_type == "Assessment":
        visit.ai_status = "Failed"
    _audit_failure(db, log, visit)
    db.flush()


def sweep_expired_jobs(
    db: Session,
    *,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    now: datetime | None = None,
) -> dict[str, int]:
    """Thu hồi lease hết hạn; caller sở hữu commit/rollback của lượt sweep."""
    if isinstance(max_attempts, bool) or not isinstance(max_attempts, int) or max_attempts < 1:
        raise ValueError("max_attempts phải là số nguyên dương")
    swept_at = now or _now()
    expired = list(db.scalars(
        select(AiAssessmentLog)
        .where(
            AiAssessmentLog.status == "Running",
            AiAssessmentLog.lease_until < swept_at,
        )
        .order_by(AiAssessmentLog.lease_until.asc(), AiAssessmentLog.assessment_id.asc())
        .with_for_update(skip_locked=True)
    ))
    counts = {"requeued": 0, "failed": 0}
    for log in expired:
        log.attempt_count += 1
        if log.attempt_count >= max_attempts:
            _mark_failed(db, log, failed_at=swept_at)
            counts["failed"] += 1
        else:
            log.status = "Queued"
            log.started_at = None
            log.lease_until = None
            log.completed_at = None
            log.error_detail = None
            counts["requeued"] += 1
    db.flush()
    return counts


def _known_identifiers(patient: Patient) -> list[str]:
    values: list[Any] = [
        patient.full_name,
        patient.phone,
        patient.id_number,
        patient.address,
        patient.date_of_birth.isoformat() if isinstance(patient.date_of_birth, date) else None,
    ]
    return [value for value in values if isinstance(value, str) and value.strip()]


def _model_metadata(client: LLMClient) -> tuple[str | None, str | None]:
    name = getattr(client, "model_name", None) or getattr(client, "model", None)
    version = getattr(client, "model_version", None) or getattr(client, "version", None)
    return name, version


async def _execute_extraction(
    db: Session,
    log: AiAssessmentLog,
    knowledge_reader: KnowledgeReader,
    llm_client: LLMClient,
) -> None:
    visit = db.get(Visit, log.visit_id)
    if visit is None:
        raise RuntimeError("Missing visit for extraction job")
    patient = db.get(Patient, visit.patient_id)
    if patient is None:
        raise RuntimeError("Missing patient for extraction job")
    features = assessment_service._features(db, visit, patient)
    gate_state = run_node1({"input_features": features}, knowledge_reader)
    remaining = max(
        0.0,
        feature_extractor.EXTRACTION_TIMEOUT_SECONDS
        - (_now() - (log.queued_at or _now())).total_seconds(),
    )
    started = _now()
    suggestions = await feature_extractor.extract_symptoms(
        visit.free_text_description or "",
        knowledge_reader,
        llm_client,
        db,
        gate_state=gate_state,
        identifiers=_known_identifiers(patient),
        timeout_seconds=remaining,
    )
    finished = _now()
    log.candidates = suggestions
    log.status = "Completed"
    log.mode = None
    log.completed_at = finished
    log.lease_until = None
    log.error_detail = None
    log.prompt_version = feature_extractor.EXTRACTION_PROMPT_VERSION
    log.model_name, log.model_version = _model_metadata(llm_client)
    log.latency_llm_ms = max(0, round((finished - started).total_seconds() * 1000))
    log.latency_total_ms = max(
        0, round((finished - (log.queued_at or finished)).total_seconds() * 1000)
    )
    audit_service.record(
        db,
        action="AI_ASSESSMENT",
        entity="visit",
        entity_id=visit.visit_id,
        actor_id=log.triggered_by or SYSTEM_USER_ID,
        new_values={
            "assessment_id": log.assessment_id,
            "run_type": "Extraction",
            "status": "Completed",
            "suggestion_count": len(suggestions),
            "prompt_version": log.prompt_version,
        },
    )
    db.flush()


async def process_claimed_job(
    db: Session,
    assessment_id: uuid.UUID,
    knowledge_reader: KnowledgeReader,
    llm_client: LLMClient,
    *,
    llm_semaphore: asyncio.Semaphore | None = None,
) -> AiAssessmentLog:
    """Chạy một job Running và commit kết quả cuối hoặc trạng thái Failed an toàn."""
    semaphore = llm_semaphore or asyncio.Semaphore(DEFAULT_LLM_CONCURRENCY)
    try:
        log = db.get(AiAssessmentLog, assessment_id)
        if log is None or log.status != "Running":
            raise RuntimeError("Job is not running")
        if log.lease_until is None or log.lease_until <= _now():
            raise RuntimeError("Job lease expired")
        async with semaphore:
            if log.run_type == "Assessment":
                model_name, model_version = _model_metadata(llm_client)
                log = await assessment_service.execute_queued_assessment(
                    db,
                    assessment_id,
                    knowledge_reader,
                    llm_client,
                    actor_id=log.triggered_by,
                    model_name=model_name,
                    model_version=model_version,
                )
                log.lease_until = None
            elif log.run_type == "Extraction":
                await _execute_extraction(db, log, knowledge_reader, llm_client)
            else:
                raise RuntimeError("Unsupported AI run type")
        db.commit()
        return log
    except Exception:
        db.rollback()
        log = db.get(AiAssessmentLog, assessment_id)
        if log is None:
            raise
        _mark_failed(db, log, failed_at=_now())
        db.commit()
        return log


class AIWorker:
    """Vòng lặp worker có dependency factory và giới hạn đồng thời LLM dùng chung."""

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        knowledge_reader_factory: Callable[[Session], KnowledgeReader],
        llm_client_factory: Callable[[], LLMClient],
        *,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
        llm_concurrency: int = DEFAULT_LLM_CONCURRENCY,
    ) -> None:
        if isinstance(llm_concurrency, bool) or not isinstance(llm_concurrency, int) or llm_concurrency < 1:
            raise ValueError("llm_concurrency phải là số nguyên dương")
        if isinstance(max_attempts, bool) or not isinstance(max_attempts, int) or max_attempts < 1:
            raise ValueError("max_attempts phải là số nguyên dương")
        self._session_factory = session_factory
        self._knowledge_reader_factory = knowledge_reader_factory
        self._llm_client_factory = llm_client_factory
        self.max_attempts = max_attempts
        self.llm_semaphore = asyncio.Semaphore(llm_concurrency)

    async def run_once(self) -> bool:
        with self._session_factory() as db:
            claimed = claim_next_job(db)
            if claimed is None:
                db.rollback()
                return False
            assessment_id = claimed.assessment_id
            db.commit()
        with self._session_factory() as db:
            await process_claimed_job(
                db,
                assessment_id,
                self._knowledge_reader_factory(db),
                self._llm_client_factory(),
                llm_semaphore=self.llm_semaphore,
            )
        return True

    def sweep_once(self) -> dict[str, int]:
        with self._session_factory() as db:
            counts = sweep_expired_jobs(db, max_attempts=self.max_attempts)
            db.commit()
            return counts

    async def run_forever(
        self,
        *,
        poll_interval_seconds: float = 1.0,
        sweep_interval_seconds: float = SWEEP_INTERVAL_SECONDS,
    ) -> None:
        if poll_interval_seconds <= 0 or sweep_interval_seconds <= 0:
            raise ValueError("Worker intervals phải lớn hơn 0")
        loop = asyncio.get_running_loop()
        next_sweep = loop.time()
        while True:
            if loop.time() >= next_sweep:
                self.sweep_once()
                next_sweep = loop.time() + sweep_interval_seconds
            worked = await self.run_once()
            if not worked:
                await asyncio.sleep(poll_interval_seconds)
