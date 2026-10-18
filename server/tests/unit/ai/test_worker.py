"""AI-12: hàng đợi bền vững, lease, sweeper và dispatch worker AI."""

import asyncio
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import func, select

from app.ai.extraction import feature_extractor
from app.core.database import SessionLocal
from app.models import AiAssessmentLog, AuditLog, Patient, Visit, VisitSymptom
from app.services import assessment_service
from app.worker.runner import (
    AIWorker,
    LEASE_SECONDS,
    claim_next_job,
    process_claimed_job,
    sweep_expired_jobs,
)
from tests.unit.ai.fakes import FakeKnowledgeReader, MockLLMClient


def _visit(db, users, *, free_text="Ho và sốt", phone=None):
    patient = Patient(
        full_name=f"Ca Worker {uuid.uuid4().hex[:8]}",
        date_of_birth=date(1990, 1, 1),
        gender="Male",
        phone=phone,
    )
    db.add(patient)
    db.flush()
    visit = Visit(
        patient_id=patient.patient_id,
        nurse_id=users["yta"].user_id,
        chief_complaint="Ca cấu trúc",
        free_text_description=free_text,
        triage_priority_rule="Routine",
        triage_priority="Routine",
        ai_status="Pending",
        is_red_flag=False,
    )
    db.add(visit)
    db.flush()
    return patient, visit


def _log(
    db,
    users,
    visit,
    *,
    run_type="Assessment",
    status="Queued",
    queued_at=None,
    attempt_count=0,
    lease_until=None,
):
    queued_at = queued_at or datetime.now(UTC)
    running = status == "Running"
    log = AiAssessmentLog(
        visit_id=visit.visit_id,
        run_type=run_type,
        triggered_by=users["yta"].user_id,
        status=status,
        priority_rule="Routine" if run_type == "Assessment" else None,
        priority_final="Routine" if run_type == "Assessment" else None,
        rule_hits={"hits": [], "complete_now": []} if run_type == "Assessment" else None,
        candidates=[],
        queued_at=queued_at,
        started_at=queued_at if running else None,
        lease_until=lease_until if running else None,
        attempt_count=attempt_count,
    )
    db.add(log)
    db.flush()
    return log


def test_claim_uses_oldest_queue_order_and_skips_locked_row(users):
    base = datetime.now(UTC) - timedelta(minutes=5)
    with SessionLocal() as setup:
        _, visit = _visit(setup, users)
        first = _log(setup, users, visit, run_type="Extraction", queued_at=base)
        second = _log(
            setup, users, visit, run_type="Extraction", queued_at=base + timedelta(seconds=1)
        )
        first_id, second_id = first.assessment_id, second.assessment_id
        setup.commit()

    with SessionLocal() as locker, SessionLocal() as worker:
        locked = locker.scalar(
            select(AiAssessmentLog)
            .where(AiAssessmentLog.assessment_id == first_id)
            .with_for_update()
        )
        assert locked.assessment_id == first_id
        now = datetime.now(UTC)
        claimed = claim_next_job(worker, now=now)
        assert claimed.assessment_id == second_id
        assert claimed.status == "Running"
        assert claimed.started_at == now
        assert claimed.lease_until == now + timedelta(seconds=LEASE_SECONDS)
        worker.flush()
        worker.rollback()
        locker.rollback()


def test_sweeper_requeues_then_fails_at_max_attempts_with_audit(users):
    now = datetime.now(UTC)
    with SessionLocal() as db:
        _, retry_visit = _visit(db, users)
        _, failed_visit = _visit(db, users)
        retry = _log(
            db, users, retry_visit, status="Running", attempt_count=0,
            lease_until=now - timedelta(seconds=2),
        )
        failed = _log(
            db, users, failed_visit, status="Running", attempt_count=2,
            lease_until=now - timedelta(seconds=1),
        )
        counts = sweep_expired_jobs(db, max_attempts=3, now=now)

        assert counts == {"requeued": 1, "failed": 1}
        assert retry.status == "Queued" and retry.attempt_count == 1
        assert retry.started_at is None and retry.lease_until is None
        assert failed.status == "Failed" and failed.attempt_count == 3
        assert failed.completed_at == now and failed.lease_until is None
        assert failed.error_detail == "WORKER_EXECUTION_FAILED"
        assert failed_visit.ai_status == "Failed"
        audit = db.scalar(select(AuditLog).where(
            AuditLog.action_type == "AI_ASSESSMENT",
            AuditLog.entity_id == failed_visit.visit_id,
        ))
        assert audit is not None and audit.new_values["error_code"] == "WORKER_EXECUTION_FAILED"
        db.rollback()


@pytest.mark.parametrize(
    "status,mode,visit_status",
    [
        ("Completed", "Full", "Ready"),
        ("Degraded", "RuleOnly", "Degraded"),
        ("Skipped", "RuleOnly", "Skipped"),
    ],
)
def test_assessment_dispatch_commits_service_result(
    users, monkeypatch, status, mode, visit_status
):
    with SessionLocal() as setup:
        _, visit = _visit(setup, users)
        now = datetime.now(UTC)
        log = _log(
            setup, users, visit, status="Running", lease_until=now + timedelta(seconds=120)
        )
        assessment_id, visit_id = log.assessment_id, visit.visit_id
        setup.commit()

    called = []

    async def execute(db, job_id, reader, client, **kwargs):
        called.append((job_id, reader, client, kwargs))
        current = db.get(AiAssessmentLog, job_id)
        current_visit = db.get(Visit, current.visit_id)
        current.status = status
        current.mode = mode
        current.completed_at = datetime.now(UTC)
        current_visit.ai_status = visit_status
        db.flush()
        return current

    monkeypatch.setattr(assessment_service, "execute_queued_assessment", execute)
    reader = FakeKnowledgeReader()
    client = MockLLMClient()
    client.model_name = "local-model"
    client.model_version = "v1"
    with SessionLocal() as db:
        result = asyncio.run(process_claimed_job(db, assessment_id, reader, client))
        assert result.status == status and result.mode == mode and result.lease_until is None
    with SessionLocal() as verify:
        persisted = verify.get(AiAssessmentLog, assessment_id)
        assert persisted.status == status and persisted.lease_until is None
        assert verify.get(Visit, visit_id).ai_status == visit_status
    assert called[0][0] == assessment_id
    assert called[0][3]["model_name"] == "local-model"
    assert called[0][3]["model_version"] == "v1"


def test_extraction_saves_only_filtered_suggestions_and_not_visit_symptoms(users, monkeypatch):
    with SessionLocal() as setup:
        patient, visit = _visit(
            setup, users, free_text="Nguyễn Văn A ho và sốt", phone="0901234567"
        )
        now = datetime.now(UTC)
        log = _log(
            setup, users, visit, run_type="Extraction", status="Running",
            lease_until=now + timedelta(seconds=120),
        )
        assessment_id = log.assessment_id
        patient_name, visit_id = patient.full_name, visit.visit_id
        setup.commit()

    suggestions = [{
        "symptom_code": "cough",
        "status": "PRESENT",
        "label": "Reference Suggestion",
        "requires_confirmation": True,
    }]

    async def extract(text, reader, client, db, **kwargs):
        assert patient_name in kwargs["identifiers"]
        assert "0901234567" in kwargs["identifiers"]
        assert kwargs["gate_state"]["priority_rule"] == "Routine"
        assert 0 <= kwargs["timeout_seconds"] <= 30
        return suggestions

    monkeypatch.setattr(feature_extractor, "extract_symptoms", extract)
    client = MockLLMClient()
    client.model_name = "extractor"
    client.model_version = "v2"
    with SessionLocal() as db:
        result = asyncio.run(process_claimed_job(
            db, assessment_id, FakeKnowledgeReader(), client
        ))
        assert result.status == "Completed" and result.completed_at is not None
        assert result.candidates == suggestions and result.mode is None
        assert result.prompt_version == feature_extractor.EXTRACTION_PROMPT_VERSION
        assert result.model_name == "extractor" and result.model_version == "v2"
    with SessionLocal() as verify:
        assert verify.scalar(select(func.count()).select_from(VisitSymptom).where(
            VisitSymptom.visit_id == visit_id
        )) == 0
        audit = verify.scalar(select(AuditLog).where(
            AuditLog.action_type == "AI_ASSESSMENT", AuditLog.entity_id == visit_id,
            AuditLog.new_values["run_type"].astext == "Extraction",
        ))
        assert audit is not None and audit.new_values["suggestion_count"] == 1


def test_unrecoverable_failure_is_sanitized_and_marks_assessment_failed(users, monkeypatch):
    marker = "SYNTHETIC_PRIVATE_MARKER raw prompt"
    with SessionLocal() as setup:
        _, visit = _visit(setup, users)
        now = datetime.now(UTC)
        log = _log(
            setup, users, visit, status="Running", lease_until=now + timedelta(seconds=120)
        )
        assessment_id, visit_id = log.assessment_id, visit.visit_id
        setup.commit()

    async def unavailable(*args, **kwargs):
        raise RuntimeError(marker)

    monkeypatch.setattr(assessment_service, "execute_queued_assessment", unavailable)
    with SessionLocal() as db:
        result = asyncio.run(process_claimed_job(
            db, assessment_id, FakeKnowledgeReader(), MockLLMClient()
        ))
        assert result.status == "Failed" and result.completed_at is not None
        assert result.error_detail == "WORKER_EXECUTION_FAILED"
    with SessionLocal() as verify:
        assert verify.get(Visit, visit_id).ai_status == "Failed"
        audit = verify.scalar(select(AuditLog).where(
            AuditLog.action_type == "AI_ASSESSMENT", AuditLog.entity_id == visit_id,
        ))
        assert audit is not None
        assert marker not in str(audit.new_values) + result.error_detail


def test_shared_semaphore_limits_llm_jobs_to_one(users, monkeypatch):
    ids = []
    with SessionLocal() as setup:
        now = datetime.now(UTC)
        for _ in range(2):
            _, visit = _visit(setup, users)
            log = _log(
                setup, users, visit, run_type="Extraction", status="Running",
                lease_until=now + timedelta(seconds=120),
            )
            ids.append(log.assessment_id)
        setup.commit()

    active = 0
    maximum = 0

    async def extract(*args, **kwargs):
        nonlocal active, maximum
        active += 1
        maximum = max(maximum, active)
        await asyncio.sleep(0.02)
        active -= 1
        return []

    monkeypatch.setattr(feature_extractor, "extract_symptoms", extract)
    semaphore = asyncio.Semaphore(1)

    async def run_both():
        db1, db2 = SessionLocal(), SessionLocal()
        try:
            await asyncio.gather(
                process_claimed_job(
                    db1, ids[0], FakeKnowledgeReader(), MockLLMClient(),
                    llm_semaphore=semaphore,
                ),
                process_claimed_job(
                    db2, ids[1], FakeKnowledgeReader(), MockLLMClient(),
                    llm_semaphore=semaphore,
                ),
            )
        finally:
            db1.close()
            db2.close()

    asyncio.run(run_both())
    assert maximum == 1


def test_worker_defaults_to_single_llm_slot(users):
    worker = AIWorker(
        SessionLocal,
        lambda db: FakeKnowledgeReader(),
        lambda: MockLLMClient(),
    )
    assert worker.max_attempts == 3
    assert worker.llm_semaphore._value == 1
