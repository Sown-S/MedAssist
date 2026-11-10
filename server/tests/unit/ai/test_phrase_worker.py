"""Kiểm worker trích xuất với selector thật và session giả."""

import asyncio
import datetime
from types import SimpleNamespace
import uuid

import pytest

from app.ai.extraction import phrase_selector
from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.llm.prompts import PHRASE_EXTRACTION_PROMPT_VERSION
from app.worker import runner
from tests.unit.ai.test_phrase_selector import Client, NOTE, ROWS, VALID


@pytest.fixture
def env(monkeypatch):
    release_id, assessment_id, visit_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    snapshot = SimpleNamespace(release={"release_id": str(release_id)}, symptoms=ROWS,
                               conditions=[], triage_rules=[])
    reader = SimpleNamespace(refresh=lambda: snapshot, active_triage_rules=lambda: snapshot.triage_rules)
    visit = SimpleNamespace(patient_id=uuid.uuid4(), free_text_description=NOTE)
    patient = SimpleNamespace(full_name="PRIVATE_PERSON", phone=None, id_number=None,
                              address=None, date_of_birth=None)
    run = SimpleNamespace(assessment_id=assessment_id, visit_id=visit_id, status="Running",
                          run_type="Extraction", attempt_count=2, triggered_by=uuid.uuid4(),
                          candidates=[{"stale": True}], llm_output_raw=None)
    sessions, events = [], []

    class Session:
        def __init__(self):
            self.commits, self.rollbacks = 0, 0
            self.locked = False
            sessions.append(self)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def get(self, model, key, **kwargs):
            if model is runner.Visit:
                assert key == visit_id
                return visit
            if model is runner.Patient:
                return patient
            assert model is runner.AiAssessmentLog and key == assessment_id
            if kwargs.get("with_for_update"):
                self.locked = True
                events.append("lock")
            return run

        def flush(self):
            events.append("flush")

        def commit(self):
            self.commits += 1
            events.append("commit")

        def rollback(self):
            self.rollbacks += 1

    audits = []
    def audit(db, **kwargs):
        assert db is sessions[-1] and not db.commits
        audits.append(kwargs)
        events.append("audit")

    monkeypatch.setattr(runner, "settings", SimpleNamespace(
        AI_EXTRACTION_STRATEGY="phrases", AI_EXTRACTION_CANDIDATES_PER_PHRASE=1))
    monkeypatch.setattr(runner, "_phrase_index_cache", CandidateIndexCache())
    monkeypatch.setattr(runner.q, "build_input_features", lambda db, v: {"symptoms": {}})
    monkeypatch.setattr(runner.audit_service, "record", audit)
    monkeypatch.setattr(phrase_selector.knowledge_validators, "active_symptoms", lambda db, codes: None)
    state = SimpleNamespace(reader=reader, snapshot=snapshot, run=run, visit=visit, sessions=sessions,
                            audits=audits, events=events, release_id=release_id)
    async def process(client=None, *, waited=0, attempt=2):
        await runner._process_extraction(
            assessment_id, visit_id, datetime.datetime.now(datetime.UTC) - datetime.timedelta(seconds=waited),
            reader, client or Client(), "local-gemma", Session, attempt_count=attempt,
        )
    state.process = process
    return state


def test_worker_selects_once_pins_snapshot_and_commits_audit_atomically(env):
    newer = SimpleNamespace(release={"release_id": str(uuid.uuid4())}, symptoms=[], conditions=[], triage_rules=[])
    client = Client(callback=lambda: setattr(env.reader, "refresh", lambda: newer))
    asyncio.run(env.process(client, waited=12))
    assert len(client.calls) == 1 and 0 < client.calls[0]["timeout_seconds"] <= 18
    assert env.run.status == "Completed" and len(env.run.candidates) == 2
    assert all(row["requires_confirmation"] for row in env.run.candidates)
    assert env.run.knowledge_release_id == env.release_id
    assert env.run.prompt_version == PHRASE_EXTRACTION_PROMPT_VERSION
    assert env.run.validation_result == {"valid": True, "reason": None}
    assert env.run.rule_hits == {"hits": [], "complete_now": []}
    assert env.run.llm_output_raw is None
    assert env.sessions[0].rollbacks == 1 and not env.sessions[0].commits
    assert env.sessions[-1].locked and env.sessions[-1].commits == 1
    assert env.events.index("lock") < env.events.index("audit") < env.events.index("commit")
    assert env.audits[0]["new_values"]["status"] == "Completed"
    assert "PRIVATE_PERSON" not in repr(env.audits)


@pytest.mark.parametrize("output,code", [({}, "INVALID_SELECTION"),
    ({**VALID, "unmapped": ["p2"]}, "UNMAPPED_PHRASE")])
def test_incomplete_output_is_failed_and_never_partial(env, output, code):
    asyncio.run(env.process(Client(output)))
    assert env.run.status == "Failed" and env.run.error_detail == code
    assert env.run.candidates == [] and env.run.lease_until is None
    assert env.run.validation_result == {"valid": False, "reason": code}
    assert env.audits[0]["new_values"]["status"] == "Failed"
    assert env.events.index("audit") < env.events.index("commit")


def test_expired_queue_never_calls_llm(env):
    client = Client()
    asyncio.run(env.process(client, waited=31))
    assert not client.calls and env.run.status == "Failed"
    assert env.run.error_detail == "EXTRACTION_TIMEOUT" and env.run.candidates == []


def test_deadline_expiring_before_write_discards_suggestions(env, monkeypatch):
    budgets = iter([10, 0])
    monkeypatch.setattr(runner, "_remaining_budget", lambda *args: next(budgets))
    asyncio.run(env.process())
    assert env.run.status == "Failed" and env.run.error_detail == "EXTRACTION_TIMEOUT"
    assert env.run.candidates == []


@pytest.mark.parametrize("status,attempt", [("Completed", 2), ("Running", 3), ("Skipped", 2)])
def test_superseded_attempt_cannot_write_or_audit(env, status, attempt):
    env.run.status, env.run.attempt_count = status, attempt
    asyncio.run(env.process())
    assert not env.audits and not env.sessions[-1].commits
    assert env.sessions[-1].rollbacks == 1
    assert env.run.status == status and env.run.candidates == [{"stale": True}]


def test_red_flag_is_skipped_without_llm(env, monkeypatch):
    gate = {"is_red_flag": True, "rule_hits": [], "complete_now": [], "ai_status": "Skipped"}
    monkeypatch.setattr(runner, "run_node1", lambda *args: gate)
    client = Client()
    asyncio.run(env.process(client))
    assert not client.calls and env.run.status == "Skipped"
    assert env.run.candidates == [] and env.run.lease_until is None
    assert env.audits[0]["new_values"]["status"] == "Skipped"


def test_cancellation_leaves_lease_for_sweeper(env):
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(env.process(Client(error=asyncio.CancelledError())))
    assert len(env.sessions) == 1 and env.run.status == "Running"
    assert not env.audits


def test_infrastructure_exception_does_not_log_text(env, caplog):
    asyncio.run(env.process(Client(error=RuntimeError("PRIVATE_PERSON raw narrative"))))
    assert env.run.status == "Failed" and env.run.error_detail == "RuntimeError"
    assert "PRIVATE_PERSON" not in caplog.text + repr(env.audits)


def test_valid_empty_result_is_completed(env):
    asyncio.run(env.process(Client({"p1": [], "p2": [], "unmapped": []})))
    assert env.run.status == "Completed" and env.run.candidates == []
    assert env.run.validation_result["valid"] is True


def test_explicit_legacy_setting_uses_original_extractor(env, monkeypatch):
    monkeypatch.setattr(runner.settings, "AI_EXTRACTION_STRATEGY", "legacy")
    calls = []
    async def legacy(*args, **kwargs):
        calls.append(kwargs)
        return []
    monkeypatch.setattr(runner.feature_extractor, "extract_symptoms", legacy)
    client = Client()
    asyncio.run(env.process(client))
    assert len(calls) == 1 and not client.calls
    assert env.run.prompt_version == runner.feature_extractor.EXTRACTION_PROMPT_VERSION


def test_unknown_strategy_is_configuration_error(env, monkeypatch):
    monkeypatch.setattr(runner.settings, "AI_EXTRACTION_STRATEGY", "typo")
    with pytest.raises(ValueError, match="strategy"):
        asyncio.run(env.process())
    assert not env.sessions
