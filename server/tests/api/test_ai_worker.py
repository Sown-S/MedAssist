"""Knowledge Reader (DB, cache theo epoch), xếp hàng đánh giá (Node 1 đồng bộ) và trích xuất triệu chứng,
worker (SKIP LOCKED, lease, sweeper), ghi kết quả vào ai_assessment_log + visit."""
import asyncio
import datetime
import uuid

import pytest
from sqlalchemy import select, text, update

from app.ai.llm.client import LLMClient
from app.ai.llm.fake_client import FakeLLMClient
from app.core.database import SessionLocal, engine
from app.ai.extraction import feature_extractor
from app.models import AiAssessmentLog, Patient, TriageRule, User, Visit
from app.services import ai_queue_service as q
from app.services.knowledge_reader import DbKnowledgeReader
from app.worker import runner


# ---------------------------------------------------------------------------- tiện ích
@pytest.fixture
def make_visit(client, nurse):
    """Lượt khám đã xác nhận triệu chứng. Trả visit_id."""
    def _make(symptoms: dict[str, str], dob="1990-05-10", vitals=None):
        pid = client.post("/api/v1/patients", headers=nurse, json={
            "full_name": f"AI Worker {uuid.uuid4().hex[:6]}", "date_of_birth": dob, "gender": "Male"}).json()["patient_id"]
        body = {"patient_id": pid, "chief_complaint": "Sốt ho"}
        if vitals:
            body["vital_signs"] = vitals
        vid = client.post("/api/v1/visits", headers=nurse, json=body).json()["visit_id"]
        r = client.put(f"/api/v1/visits/{vid}/symptoms", headers=nurse,
                       json={"symptoms": [{"symptom_code": c, "state": s} for c, s in symptoms.items()]})
        assert r.status_code == 200, r.text
        return vid
    return _make


@pytest.fixture
def nurse_user(users):
    with SessionLocal() as db:
        return db.scalar(select(User).where(User.username == "yta"))


def _enqueue(vid, actor, reader=None):
    reader = reader or DbKnowledgeReader()
    with SessionLocal() as db:
        run = q.enqueue_assessment(db, uuid.UUID(vid), actor, reader)
        db.commit()
        return run.assessment_id


def _run(aid):
    with SessionLocal() as db:
        return db.get(AiAssessmentLog, aid)


def _visit(vid):
    with SessionLocal() as db:
        return db.get(Visit, uuid.UUID(vid))


def _drain_other_jobs():
    """Hàng đợi dùng chung giữa các test: đánh dấu mọi việc Queued còn sót là đã thay thế."""
    with SessionLocal() as db:
        db.execute(update(AiAssessmentLog).where(AiAssessmentLog.status.in_(["Queued", "Running"]))
                   .values(status="Skipped", error_detail="SUPERSEDED", lease_until=None,
                           completed_at=datetime.datetime.now(datetime.UTC)))
        db.commit()


@pytest.fixture(autouse=True)
def _clean_queue(wk_knowledge):
    _drain_other_jobs()
    yield
    _drain_other_jobs()


class _FakeLLM:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.calls = response, error, 0

    async def generate_json(self, *, prompt, schema, timeout_seconds):
        self.calls += 1
        if self.error:
            raise self.error
        return self.response


def _process(llm=None, model="test-model"):
    return asyncio.run(runner.process_one(DbKnowledgeReader(), llm or runner.DisabledLLMClient(), model))


# ---------------------------------------------------------------------------- Knowledge Reader
def test_reader_mapping(wk_knowledge):
    reader = DbKnowledgeReader()
    reader.refresh()
    conds = {c["condition_code"]: c for c in reader.active_conditions()}
    cum = conds["wk_cum_mua"]
    assert cum["name_vi"] == "Cúm mùa (thử)" and cum["icd10_code"] == "J11.1" and cum["disease_group"] == "test"
    fever = next(s for s in cum["symptoms"] if s["symptom_code"] == "wk_fever_high")
    assert fever == {"symptom_code": "wk_fever_high", "polarity": "SUPPORTS", "weight": 0.85, "is_key": True}
    assert cum["guidelines"] == [{"excerpt_key": "wk_cum_mua_chan_doan", "title": "Chẩn đoán cúm mùa",
                                  "content": "Sốt, ho, đau họng khởi phát đột ngột.",
                                  "source_title": "Hướng dẫn thử", "source_locator": "Mục 2"}]
    syms = {s["symptom_code"]: s for s in reader.active_symptoms()}
    assert syms["wk_cough_dry"]["symptom_name"] == "Ho khan"
    rel = reader.active_release()
    assert rel["label"] and rel["epoch"] >= 1
    # bản sao: sửa kết quả không làm hỏng cache
    reader.active_conditions()[0]["name_vi"] = "x"
    assert reader.active_conditions()[0]["name_vi"] != "x"


def test_reader_reloads_when_epoch_changes(wk_knowledge, owner_engine):
    reader = DbKnowledgeReader()
    first = reader.refresh()
    assert reader.refresh() is first                                    # cùng epoch: dùng cache
    with owner_engine.begin() as conn:
        conn.execute(text("UPDATE knowledge_epoch SET epoch = epoch + 1"))
    second = reader.refresh()
    assert second is not first and second.epoch == first.epoch + 1


# ---------------------------------------------------------------------------- xếp hàng
def test_enqueue_snapshots_features(make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT", "wk_cough_dry": "ABSENT"}, dob="2024-01-15",
                     vitals={"temperature_c": 39.2, "heart_rate_bpm": 120})
    aid = _enqueue(vid, nurse_user)
    run = _run(aid)
    assert run.status == "Queued" and run.run_type == "Assessment" and run.triggered_by == nurse_user.user_id
    f = run.input_features
    assert f["symptoms"] == {"wk_cough_dry": "ABSENT", "wk_fever_high": "PRESENT"}
    assert f["vital_signs"] == {"temperature_c": 39.2, "heart_rate_bpm": 120}
    assert f["age_months"] >= 20 and f["age_years"] == f["age_months"] // 12
    assert "full_name" not in str(f) and "patient_id" not in f                  # không định danh
    v = _visit(vid)
    assert v.ai_status == "Pending" and v.triage_priority == "Routine" and not v.is_red_flag


def test_new_enqueue_supersedes_queued(make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT"})
    first = _enqueue(vid, nurse_user)
    second = _enqueue(vid, nurse_user)
    assert _run(first).status == "Skipped" and _run(first).error_detail == "SUPERSEDED"
    assert _run(second).status == "Queued"


def test_enqueue_closed_visit(client, nurse, make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT"})
    client.patch(f"/api/v1/visits/{vid}/cancel", headers=nurse, json={"reason": "Bệnh nhân về"})
    with pytest.raises(Exception) as exc:
        _enqueue(vid, nurse_user)
    assert getattr(exc.value, "code", None) == "VISIT_CLOSED"


# ---------------------------------------------------------------------------- worker
def test_worker_empty_queue():
    assert _process() is False


def test_worker_rule_only_when_llm_disabled(make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT", "wk_cough_dry": "PRESENT", "wk_sore_throat": "PRESENT"})
    aid = _enqueue(vid, nurse_user)
    assert _process() is True
    run = _run(aid)
    assert run.status == "Degraded" and run.mode == "RuleOnly" and run.completed_at and run.lease_until is None
    assert run.attempt_count == 1 and run.knowledge_release_id is not None
    codes = [c["condition_code"] for c in run.candidates]
    assert codes and codes[0] == "wk_cum_mua" and set(codes) <= {"wk_cum_mua", "wk_viem_hong"}
    assert run.model_name is None and run.latency_total_ms is not None and run.latency_phase1_ms is not None
    assert _visit(vid).ai_status == "Degraded"


def test_worker_full_with_valid_llm(make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT", "wk_cough_dry": "PRESENT", "wk_sore_throat": "PRESENT"})
    aid = _enqueue(vid, nurse_user)
    # Thứ tự ứng viên do Node 2 quyết định; LLM phải xếp lại đúng tập đó, lý do tiếng Việt dẫn mã bằng chứng.
    reader = DbKnowledgeReader()
    reader.refresh()
    from app.ai.pipeline.node1_red_flag_gate import run_node1
    from app.ai.pipeline.node2_graph_retrieval import run_node2
    state = run_node2(run_node1({"input_features": _run(aid).input_features}, reader), reader)
    ranking = [{"condition_code": c["condition_code"],
                "reason": f"Có {c['supporting_evidence'][0]['symptom_code']} phù hợp với bệnh này"}
               for c in state["candidates"][:3]]
    llm = _FakeLLM({"ranking": ranking, "raise_priority": False})
    assert _process(llm) is True
    run = _run(aid)
    assert llm.calls == 1
    assert run.status == "Completed" and run.mode == "Full", run.validation_result
    assert run.model_name == "test-model" and run.prompt_version and run.latency_llm_ms is not None
    assert all(c.get("reason") for c in run.candidates)
    assert _visit(vid).ai_status == "Ready"


def test_worker_full_with_fake_llm(make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT", "wk_cough_dry": "PRESENT", "wk_sore_throat": "PRESENT"})
    aid = _enqueue(vid, nurse_user)
    assert _process(FakeLLMClient(), "fake") is True
    run = _run(aid)
    assert run.status == "Completed" and run.mode == "Full", run.validation_result
    assert run.model_name == "fake" and all(c["reason"].startswith("Gợi ý giả lập") for c in run.candidates)
    assert _visit(vid).ai_status == "Ready"


def test_preliminary_published_before_llm(make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT", "wk_cough_dry": "PRESENT"})
    aid = _enqueue(vid, nurse_user)
    seen = {}

    class _Peek(_FakeLLM):
        async def generate_json(self, **kw):
            run, visit = _run(aid), _visit(vid)
            seen.update(status=run.status, candidates=run.candidates, visit=visit.ai_status)
            raise runner.LLMConnectionError("down")

    _process(_Peek())
    assert seen["status"] == "Running" and seen["candidates"] and seen["visit"] == "Preliminary"
    assert _run(aid).status == "Degraded"


def test_older_run_does_not_overwrite_visit(make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT", "wk_cough_dry": "PRESENT"})
    old = _enqueue(vid, nurse_user)
    with SessionLocal() as db:                               # worker đã nhận việc cũ
        assert q.claim_next(db).assessment_id == old
        db.commit()
    new = _enqueue(vid, nurse_user)                          # y tá sửa triệu chứng, xếp hàng lại
    with SessionLocal() as db:
        q.write_result(db, old, {"ai_status": "Degraded", "mode": "RuleOnly", "candidates": [],
                                 "priority_rule": "Routine", "priority_final": "Routine", "rule_hits": []},
                       reader=DbKnowledgeReader(), model_name=None, prompt_version=None,
                       latency_phase1_ms=None, latency_llm_ms=None, latency_total_ms=1)
        db.commit()
    assert _run(old).status == "Degraded"
    assert _visit(vid).ai_status == "Pending" and _run(new).status == "Queued"


def test_worker_result_keeps_complete_now(make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT"})
    aid = _enqueue(vid, nurse_user)
    assert set(_run(aid).rule_hits) == {"hits", "complete_now"}
    with SessionLocal() as db:
        assert q.claim_next(db).assessment_id == aid
        db.commit()
    with SessionLocal() as db:
        q.write_result(db, aid, {"ai_status": "Degraded", "mode": "RuleOnly", "candidates": [],
                                 "priority_rule": "Routine", "priority_final": "Routine", "rule_hits": [],
                                 "complete_now": ["symptoms.wk_sore_throat"]},
                       reader=DbKnowledgeReader(), model_name=None, prompt_version=None,
                       latency_phase1_ms=None, latency_llm_ms=None, latency_total_ms=1)
        db.commit()
    assert _run(aid).rule_hits == {
        "hits": [], "complete_now": [{"symptom_code": "wk_sore_throat", "symptom_name": "Đau họng"}]}


def test_infrastructure_error_marks_failed(make_visit, nurse_user, monkeypatch):
    vid = make_visit({"wk_fever_high": "PRESENT"})
    aid = _enqueue(vid, nurse_user)

    async def _boom(*a, **k):
        raise RuntimeError("bug")
    monkeypatch.setattr(runner, "run_pipeline", _boom)
    assert _process() is True
    run = _run(aid)
    assert run.status == "Failed" and run.error_detail == "RuntimeError" and run.completed_at
    assert _visit(vid).ai_status == "Failed"


def test_skip_locked_two_workers_do_not_share(make_visit, nurse_user):
    a = _enqueue(make_visit({"wk_fever_high": "PRESENT"}), nurse_user)
    b = _enqueue(make_visit({"wk_cough_dry": "PRESENT"}), nurse_user)
    s1, s2 = SessionLocal(), SessionLocal()
    try:
        got1 = q.claim_next(s1)                              # chưa commit: dòng còn bị khóa
        got2 = q.claim_next(s2)
        assert {got1.assessment_id, got2.assessment_id} == {a, b}
        s1.commit(), s2.commit()
    finally:
        s1.close(), s2.close()


# ---------------------------------------------------------------------------- sweeper
def _expire_lease(aid, attempts):
    with SessionLocal() as db:
        db.execute(update(AiAssessmentLog).where(AiAssessmentLog.assessment_id == aid)
                   .values(status="Running", started_at=datetime.datetime.now(datetime.UTC),
                           lease_until=datetime.datetime.now(datetime.UTC) - datetime.timedelta(seconds=5),
                           attempt_count=attempts))
        db.commit()


def test_sweeper_requeues_then_fails(make_visit, nurse_user):
    vid = make_visit({"wk_fever_high": "PRESENT"})
    aid = _enqueue(vid, nurse_user)
    _expire_lease(aid, 1)
    assert runner.sweep_once() == {"requeued": 1, "failed": 0}
    run = _run(aid)
    assert run.status == "Queued" and run.lease_until is None and run.started_at is None
    _expire_lease(aid, 2)                                     # đã thử đủ WORKER_MAX_ATTEMPTS = 2
    assert runner.sweep_once() == {"requeued": 0, "failed": 1}
    assert _run(aid).status == "Failed" and _run(aid).error_detail == "LEASE_EXPIRED"
    assert _visit(vid).ai_status == "Failed"


# ---------------------------------------------------------------------------- cờ đỏ (Node 1 đồng bộ)
def test_red_flag_applied_synchronously(make_visit, nurse_user, users):
    with SessionLocal() as db:
        rel_id = db.scalar(text("SELECT release_id FROM knowledge_release WHERE label = 'TEST-WK'"))
        src_id = db.scalar(text("SELECT source_id FROM knowledge_source WHERE title = 'Hướng dẫn thử'"))
        rule = TriageRule(rule_key=f"rf_wk_{uuid.uuid4().hex[:6]}", rule_name="Cờ đỏ thử", rule_type="RED_FLAG",
                          resulting_priority="Emergency", reason_text="Sốt cao kèm SpO2 thấp",
                          condition_logic={"op": "AND", "args": [
                              {"type": "symptom", "symptom_code": "wk_fever_high", "state": "PRESENT"},
                              {"type": "vital", "vital": "spo2_pct", "cmp": "<", "value": 92}]},
                          source_id=src_id, status="Active", release_id=rel_id, created_by=users["admin"].user_id)
        db.add(rule)
        db.commit()
        rule_id = rule.triage_rule_id
    try:
        vid = make_visit({"wk_fever_high": "PRESENT"}, vitals={"spo2_pct": 88})
        aid = _enqueue(vid, nurse_user)
        run, v = _run(aid), _visit(vid)
        assert run.status == "Skipped" and run.mode == "RuleOnly" and run.candidates == []
        assert v.is_red_flag and v.triage_priority == "Emergency" and v.red_flag_rule_id == rule_id
        assert v.ai_status == "Skipped" and v.red_flag_reason == "Sốt cao kèm SpO2 thấp"
    finally:
        with SessionLocal() as db:
            db.execute(update(TriageRule).where(TriageRule.triage_rule_id == rule_id)
                       .values(status="Retired", retired_by=users["admin"].user_id,
                               retired_at=datetime.datetime.now(datetime.UTC), retired_reason="Deactivated"))
            db.commit()


# ---------------------------------------------------------------------------- vòng lặp worker
def test_make_llm_client(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "LLM_PROVIDER", "none")
    client, model = runner.make_llm_client()
    assert isinstance(client, runner.DisabledLLMClient) and model is None
    monkeypatch.setattr(settings, "LLM_PROVIDER", "fake")
    client, model = runner.make_llm_client()
    assert isinstance(client, FakeLLMClient) and model == "fake"
    monkeypatch.setattr(settings, "LLM_PROVIDER", "ollama")
    client, model = runner.make_llm_client()
    assert isinstance(client, LLMClient) and model == settings.OLLAMA_MODEL


def test_run_forever_processes_then_stops(make_visit, nurse_user, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "LLM_PROVIDER", "none")
    monkeypatch.setattr(settings, "WORKER_POLL_SECONDS", 0.05)
    aid = _enqueue(make_visit({"wk_fever_high": "PRESENT", "wk_cough_dry": "PRESENT"}), nurse_user)

    async def _main():
        stop = asyncio.Event()
        task = asyncio.create_task(runner.run_forever(stop))
        for _ in range(100):
            await asyncio.sleep(0.05)
            if _run(aid).status != "Queued" and _run(aid).status != "Running":
                break
        stop.set()
        await asyncio.wait_for(task, timeout=5)

    asyncio.run(_main())
    assert _run(aid).status == "Degraded"


def test_run_forever_survives_db_errors(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "WORKER_POLL_SECONDS", 0.01)
    calls = {"n": 0}

    async def _flaky(*a, **k):
        calls["n"] += 1
        raise RuntimeError("db down")
    monkeypatch.setattr(runner, "process_one", _flaky)

    async def _main():
        stop = asyncio.Event()
        task = asyncio.create_task(runner.run_forever(stop))
        await asyncio.sleep(0.1)
        stop.set()
        await asyncio.wait_for(task, timeout=5)
    asyncio.run(_main())
    assert calls["n"] >= 2                                     # vẫn tiếp tục vòng lặp sau lỗi


# ---------------------------------------------------------------------------- trích xuất triệu chứng
NOTE = "Sốt cao 2 ngày, không ho khan, chưa rõ đau họng."


@pytest.fixture
def text_visit(client, nurse, make_visit):
    def _make(note=NOTE):
        vid = make_visit({})
        r = client.patch(f"/api/v1/visits/{vid}", headers=nurse, json={"free_text_description": note})
        assert r.status_code == 200, r.text
        return vid
    return _make


class _RecordingLLM(FakeLLMClient):
    def __init__(self):
        self.prompts = []

    async def generate_json(self, *, prompt, schema, timeout_seconds):
        self.prompts.append(prompt)
        return await super().generate_json(prompt=prompt, schema=schema, timeout_seconds=timeout_seconds)


def _extractions(vid):
    with SessionLocal() as db:
        return list(db.scalars(select(AiAssessmentLog)
                               .where(AiAssessmentLog.visit_id == uuid.UUID(vid),
                                      AiAssessmentLog.run_type == "Extraction")
                               .order_by(AiAssessmentLog.queued_at)))


def test_extraction_api_then_worker_returns_suggestions_only(client, nurse, text_visit):
    vid = text_visit()
    r = client.post(f"/api/v1/visits/{vid}/symptom-extraction", headers=nurse)
    assert r.status_code == 202, r.text
    assert r.json()["status"] == "Queued" and r.json()["suggestions"] == []
    ai_status_before = _visit(vid).ai_status

    assert _process(FakeLLMClient(), "fake") is True
    body = client.get(f"/api/v1/visits/{vid}/symptom-extraction", headers=nurse).json()
    assert body["status"] == "Completed" and body["completed_at"]
    got = {s["symptom_code"]: s for s in body["suggestions"]}
    assert got["wk_fever_high"]["status"] == "PRESENT" and got["wk_fever_high"]["symptom_name"] == "Sốt cao"
    assert got["wk_cough_dry"]["status"] == "ABSENT" and got["wk_sore_throat"]["status"] == "UNKNOWN"
    assert all(s["label"] == "Reference Suggestion" and s["requires_confirmation"] for s in body["suggestions"])

    run = _extractions(vid)[-1]
    assert run.model_name == "fake" and run.prompt_version == feature_extractor.EXTRACTION_PROMPT_VERSION
    assert _visit(vid).ai_status == ai_status_before
    assert client.get(f"/api/v1/visits/{vid}/symptoms", headers=nurse).json() == []


def test_extraction_masks_patient_identifiers(client, nurse, text_visit):
    vid = text_visit()
    with SessionLocal() as db:
        name = db.get(Patient, _visit(vid).patient_id).full_name
    r = client.patch(f"/api/v1/visits/{vid}", headers=nurse,
                     json={"free_text_description": f"{name} sốt cao từ hôm qua"})
    assert r.status_code == 200, r.text
    client.post(f"/api/v1/visits/{vid}/symptom-extraction", headers=nurse)
    llm = _RecordingLLM()
    assert _process(llm, "fake") is True
    assert llm.prompts and all(name not in p for p in llm.prompts)


def test_extraction_requires_free_text_and_nurse(client, nurse, doctor, make_visit, text_visit):
    vid = make_visit({})
    r = client.post(f"/api/v1/visits/{vid}/symptom-extraction", headers=nurse)
    assert r.status_code == 422 and r.json()["error"]["code"] == "NO_FREE_TEXT"
    assert client.get(f"/api/v1/visits/{vid}/symptom-extraction", headers=nurse).status_code == 404
    assert client.post(f"/api/v1/visits/{text_visit()}/symptom-extraction", headers=doctor).status_code == 403


def test_extraction_claimed_before_assessment_and_supersedes_queued(client, nurse, nurse_user, text_visit):
    vid = text_visit()
    aid = _enqueue(vid, nurse_user)
    client.post(f"/api/v1/visits/{vid}/symptom-extraction", headers=nurse)
    client.post(f"/api/v1/visits/{vid}/symptom-extraction", headers=nurse)
    first, second = _extractions(vid)
    assert first.status == "Skipped" and first.error_detail == "SUPERSEDED"

    assert _process(FakeLLMClient(), "fake") is True
    assert _run(second.assessment_id).status == "Completed"
    assert _run(aid).status == "Queued"


def test_extraction_failure_keeps_visit_ai_status(client, nurse, text_visit, monkeypatch):
    vid = text_visit()
    client.post(f"/api/v1/visits/{vid}/symptom-extraction", headers=nurse)
    ai_status_before = _visit(vid).ai_status

    async def boom(*args, **kwargs):
        raise RuntimeError("hạ tầng lỗi")

    monkeypatch.setattr(feature_extractor, "extract_symptoms", boom)
    assert _process(FakeLLMClient(), "fake") is True
    run = _extractions(vid)[-1]
    assert run.status == "Failed" and run.error_detail == "RuntimeError"
    assert _visit(vid).ai_status == ai_status_before
    body = client.get(f"/api/v1/visits/{vid}/symptom-extraction", headers=nurse).json()
    assert body["status"] == "Failed" and body["suggestions"] == []
