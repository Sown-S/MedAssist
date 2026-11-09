"""Một lượt chọn mã: enum từng cụm, schema đầy đủ, Active/HITL và deadline."""

import asyncio
from copy import deepcopy
import json
from time import monotonic

import httpx
import pytest

from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction import phrase_selector as selector
from app.ai.extraction.phrase_retrieval import retrieve_phrases
from app.ai.llm.client import LLMClient, LLMHTTPError, LLMResponseError
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.exceptions import AppError
from tests.unit.ai.fakes import FakeKnowledgeReader


ROWS = [{"symptom_code": "cough_dry", "symptom_name": "Ho khan"},
        {"symptom_code": "vertigo", "symptom_name": "Chóng mặt xoay tròn"}]
NOTE = "Có ho khan; không chóng mặt xoay tròn."
VALID = {"p1": [{"symptom_code": "cough_dry", "status": "PRESENT"}],
         "p2": [{"symptom_code": "vertigo", "status": "ABSENT"}], "unmapped": []}


class Client:
    def __init__(self, output=None, error=None, callback=None):
        self.output = deepcopy(VALID if output is None else output)
        self.error, self.callback, self.calls = error, callback, []

    async def generate_json(self, **kwargs):
        self.calls.append(kwargs)
        if self.callback:
            self.callback()
        if self.error:
            raise self.error
        return self.output


@pytest.fixture
def context(monkeypatch):
    reader = FakeKnowledgeReader(symptoms=ROWS)
    db, validated = object(), []
    def active(session, codes):
        assert session is db
        validated.append(codes)
    monkeypatch.setattr(selector.knowledge_validators, "active_symptoms", active)
    return reader, db, validated


def run(context, client=None, *, text=NOTE, timeout=30, gate=None, identifiers=()):
    reader, db, _ = context
    return asyncio.run(selector.select_phrase_symptoms(
        text, reader, client or Client(), db, cache=CandidateIndexCache(), per_phrase_limit=1,
        gate_state=gate if gate is not None else run_node1({"input_features": {"symptoms": {}}}, reader),
        identifiers=identifiers, timeout_seconds=timeout,
    ))


def test_one_call_keeps_codes_per_group_and_returns_hitl(context):
    client = Client()
    result = run(context, client)
    assert result.completed and result.failure_code is None
    assert len(client.calls) == 1
    assert result.suggestions == (
        {"symptom_code": "cough_dry", "status": "PRESENT", "label": "Reference Suggestion", "requires_confirmation": True},
        {"symptom_code": "vertigo", "status": "ABSENT", "label": "Reference Suggestion", "requires_confirmation": True},
    )
    assert context[2] == [["cough_dry", "vertigo"]]
    request = client.calls[0]
    assert 0 < request["timeout_seconds"] <= 30
    schema = request["schema"]
    assert schema["title"] == "PhraseExtractionOutput"
    assert set(schema["required"]) == {"p1", "p2", "unmapped"}
    assert schema["properties"]["p1"]["items"]["properties"]["symptom_code"]["enum"] == ["cough_dry"]
    payload = json.loads(request["prompt"].rsplit("\n", 1)[-1])
    assert list(payload)[-1] == "text"
    assert payload["groups"]["p2"]["context"] == "không chóng mặt xoay tròn"


def test_shared_negation_is_sent_as_one_group_without_losing_candidates(context):
    client = Client({"p1": [
        {"symptom_code": "cough_dry", "status": "ABSENT"},
        {"symptom_code": "vertigo", "status": "ABSENT"},
    ], "unmapped": []})
    note = "Không ho khan và chóng mặt xoay tròn."
    result = run(context, client, text=note)
    assert result.completed and len(client.calls) == 1
    assert {row["symptom_code"] for row in result.suggestions} == {"cough_dry", "vertigo"}
    assert all(row["status"] == "ABSENT" and row["requires_confirmation"] for row in result.suggestions)
    request = client.calls[0]
    payload = json.loads(request["prompt"].rsplit("\n", 1)[-1])
    assert list(payload["groups"]) == ["p1"]
    assert payload["groups"]["p1"]["phrase"] == note[:-1]
    assert set(request["schema"]["properties"]["p1"]["items"]["properties"]["symptom_code"]["enum"]) == {
        "cough_dry", "vertigo"}
    assert context[2] == [["cough_dry", "vertigo"]]


@pytest.mark.parametrize("output", [
    {}, {"p1": [], "unmapped": []}, {**VALID, "extra": []}, {**VALID, "p1": None},
    {**VALID, "p1": [{"symptom_code": "vertigo", "status": "PRESENT"}]},
    {**VALID, "p1": [{"symptom_code": "made_up", "status": "PRESENT"}]},
    {**VALID, "p1": [{"symptom_code": "cough_dry", "status": "present"}]},
    {**VALID, "p1": [{"symptom_code": "cough_dry", "status": "PRESENT", "text": "RAW"}]},
    {**VALID, "p1": VALID["p1"] * 2}, {**VALID, "unmapped": "p1"},
    {**VALID, "unmapped": ["p9"]}, {**VALID, "unmapped": ["p1", "p1"]},
])
def test_invalid_output_rejects_entire_result(context, output):
    result = run(context, Client(output))
    assert not result.completed and result.failure_code == "INVALID_SELECTION"
    assert result.suggestions == () and context[2] == []


def test_unmapped_is_technical_failure_not_unknown_or_partial(context):
    result = run(context, Client({**VALID, "unmapped": ["p2"]}))
    assert result.failure_code == "UNMAPPED_PHRASE"
    assert not result.completed and not result.suggestions


def test_all_empty_valid_output_is_successful(context):
    result = run(context, Client({"p1": [], "p2": [], "unmapped": []}))
    assert result.completed and not result.suggestions


@pytest.mark.parametrize("second,expected", [("PRESENT", True), ("ABSENT", False)])
def test_repeated_code_is_deduplicated_or_conflict_rejected(context, second, expected):
    output = {"p1": VALID["p1"], "p2": [{"symptom_code": "cough_dry", "status": second}], "unmapped": []}
    result = run(context, Client(output), text="Ho khan; có ho khan.")
    assert result.completed is expected
    assert len(result.suggestions) == (1 if expected else 0)


def test_known_identifiers_are_redacted_in_all_prompt_fields(context):
    client = Client({"p1": [], "p2": VALID["p1"], "unmapped": []})
    run(context, client, text="Họ tên: PRIVATE_NAME; có ho khan.", identifiers=["PRIVATE_NAME"])
    assert "PRIVATE_NAME" not in client.calls[0]["prompt"]
    assert "[REDACTED]" in client.calls[0]["prompt"]


@pytest.mark.parametrize("gate", [{"is_red_flag": True}, {"ai_status": "Skipped"},
                                  {"priority_rule": "Emergency"}, {"priority_final": "Emergency"}])
def test_red_flags_never_call_llm(context, gate):
    client = Client()
    result = run(context, client, gate=gate)
    assert result.failure_code == "RED_FLAG_SKIPPED" and client.calls == []


def test_gate_is_required(context):
    with pytest.raises(ValueError, match="Node 1"):
        run(context, gate={})


def test_active_validator_can_reject_retired_code(context, monkeypatch):
    def retired(*args):
        raise AppError(422, "UNKNOWN_SYMPTOM", "PRIVATE_MARKER")
    monkeypatch.setattr(selector.knowledge_validators, "active_symptoms", retired)
    result = run(context)
    assert not result.completed and result.failure_code == "UNKNOWN_SYMPTOM"
    assert "PRIVATE_MARKER" not in repr(result)


def test_snapshot_change_during_generation_invalidates_result(context):
    client = Client(callback=lambda: context[0]._symptoms.clear())
    result = run(context, client)
    assert result.failure_code == "KNOWLEDGE_SNAPSHOT_CHANGED"
    assert context[2] == []


@pytest.mark.parametrize("error", [LLMHTTPError(400), LLMResponseError("PRIVATE_RAW"), TimeoutError()])
def test_llm_error_is_safe_and_never_retried(context, error):
    client = Client(error=error)
    result = run(context, client)
    assert not result.completed and not result.suggestions and len(client.calls) == 1
    assert "PRIVATE_RAW" not in repr(result)


def test_cancellation_propagates(context):
    with pytest.raises(asyncio.CancelledError):
        run(context, Client(error=asyncio.CancelledError()))


def test_expired_and_over_budget_inputs_do_not_call_llm(context):
    client = Client()
    assert run(context, client, timeout=0).failure_code == "EXTRACTION_TIMEOUT"
    assert run(context, client, text="Ho khan;" * 13).failure_code == "REQUEST_BUDGET_EXCEEDED"
    assert client.calls == []


def test_byte_guard_is_fail_closed(context, monkeypatch):
    monkeypatch.setattr(selector, "MAX_REQUEST_BYTES", 10)
    client = Client()
    assert run(context, client).failure_code == "REQUEST_BUDGET_EXCEEDED"
    assert client.calls == []


def test_timeout_covers_slow_llm_even_if_client_ignores_budget(context):
    class Slow(Client):
        async def generate_json(self, **kwargs):
            await asyncio.sleep(0.05)
            return VALID
    assert run(context, Slow(), timeout=0.01).failure_code == "EXTRACTION_TIMEOUT"


def test_phrase_schema_requests_strict_context_and_rejects_length_output(context):
    plan = retrieve_phrases(NOTE, context[0], CandidateIndexCache(), identifiers=[],
                            per_phrase_limit=1, deadline=monotonic() + 5)
    prompt, schema = selector.selection_request(plan)
    def handler(request):
        body = json.loads(request.content)
        assert body["truncate"] is False
        assert body["options"]["num_ctx"] == 8192
        assert body["options"]["num_predict"] == 768
        return httpx.Response(200, json={"done": True, "done_reason": "length", "response": json.dumps(VALID)})
    client = LLMClient(model="synthetic-local", transport=httpx.MockTransport(handler))
    with pytest.raises(LLMResponseError):
        asyncio.run(client.generate_json(prompt=prompt, schema=schema, timeout_seconds=5))
