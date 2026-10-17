"""AI-10: synthetic Vietnamese notes, fake Active reader/validator and LLM."""

import asyncio
from copy import deepcopy
import json
import traceback
import unicodedata

import pytest

from app.ai.extraction import feature_extractor
from app.ai.extraction.feature_extractor import extract_symptoms
from app.ai.llm.client import (
    LLMConfigurationError,
    LLMConnectionError,
    LLMHTTPError,
    LLMInvalidJSONError,
    LLMResponseError,
    LLMTimeoutError,
)
from app.ai.llm.output_schemas import extraction_json_schema
from app.ai.llm.prompts import EXTRACTION_PROMPT_VERSION, load_prompt
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.pipeline.node2_graph_retrieval import run_node2
from app.exceptions import AppError
from app.validation import knowledge_validators
from tests.unit.ai.fakes import FakeKnowledgeReader, MockLLMClient

NOTE = "Sốt 2 ngày, không ho; chưa rõ khó thở."
ROWS = [
    {"symptom_code": "signal_a", "symptom_name": "Sốt", "status": "Active"},
    {"symptom_code": "signal_b", "symptom_name": "Ho", "status": "Active"},
    {"symptom_code": "signal_c", "symptom_name": "Khó thở", "status": "Active"},
]
OUTPUT = {"symptoms": [
    {"symptom_code": "signal_c", "status": "UNKNOWN"},
    {"symptom_code": "signal_a", "status": "PRESENT"},
    {"symptom_code": "signal_b", "status": "ABSENT"},
]}


@pytest.fixture
def catalogue(monkeypatch):
    class Catalogue:
        db = object()  # No query/write/commit/rollback methods available.

        def __init__(self):
            self.active = {row["symptom_code"] for row in ROWS}
            self.calls = []
            self.error = None

        def validate(self, db, codes):
            assert db is self.db
            self.calls.append(list(codes))
            if self.error is not None:
                raise self.error
            if not set(codes) <= self.active:
                raise AppError(422, "UNKNOWN_SYMPTOM", "SYNTHETIC_PRIVATE_MARKER")
            return dict.fromkeys(codes)

    fake = Catalogue()
    monkeypatch.setattr(knowledge_validators, "active_symptoms", fake.validate)
    return fake


def gated_state():
    return run_node1({"input_features": {"symptoms": {}}}, FakeKnowledgeReader())


def extract(catalogue, client=None, *, text=NOTE, reader=None, gate=None,
            identifiers=(), timeout_seconds=5):
    return asyncio.run(extract_symptoms(
        text,
        reader if reader is not None else FakeKnowledgeReader(symptoms=ROWS),
        client if client is not None else MockLLMClient(OUTPUT),
        catalogue.db,
        gate_state=gated_state() if gate is None else gate,
        identifiers=identifiers,
        timeout_seconds=timeout_seconds,
    ))


def payload(client):
    prefix = load_prompt(EXTRACTION_PROMPT_VERSION) + "\n"
    assert client.calls[0]["prompt"].startswith(prefix)
    return json.loads(client.calls[0]["prompt"][len(prefix):])


def codes_and_statuses(result):
    return {row["symptom_code"]: row["status"] for row in result}


def test_vietnamese_note_returns_three_statuses_pending_nurse_confirmation(catalogue):
    client = MockLLMClient(OUTPUT)
    original = deepcopy(client.response)

    result = extract(catalogue, client)

    assert codes_and_statuses(result) == {
        "signal_a": "PRESENT", "signal_b": "ABSENT", "signal_c": "UNKNOWN",
    }
    assert [row["symptom_code"] for row in result] == ["signal_a", "signal_b", "signal_c"]
    assert all(row["label"] == "Reference Suggestion" for row in result)
    assert all(row["requires_confirmation"] is True for row in result)
    assert all(set(row) == {"symptom_code", "status", "label", "requires_confirmation"}
               for row in result)
    assert catalogue.calls == [["signal_a", "signal_b", "signal_c"]]
    assert len(client.calls) == 1
    assert client.calls[0]["schema"] == extraction_json_schema()
    assert 0 < client.calls[0]["timeout_seconds"] <= 5
    assert client.response == original
    assert payload(client) == {
        "text": NOTE,
        "catalogue": [{"symptom_code": row["symptom_code"], "symptom_name": row["symptom_name"]}
                      for row in ROWS],
    }


def test_known_identifiers_are_masked_everywhere_without_losing_symptom_context(catalogue, caplog, capsys):
    client = MockLLMClient(OUTPUT)
    note = (
        "nguyễn  văn an ho 2 ngày; NGUYỄN VĂN AN không sốt; "
        "hẹn ở 12 Đường Mẫu, Phường Thử; gọi 0901234567; "
        "sinh 1999-02-03; số hồ sơ MA.TEST(42)."
    )
    identifiers = ["Nguyễn Văn An", "12 Đường Mẫu, Phường Thử", "MA.TEST(42)"]
    original = deepcopy(identifiers)

    result = extract(catalogue, client, text=note, identifiers=identifiers)

    sent = payload(client)["text"]
    assert "nguyễn" not in sent.casefold()
    assert all(value not in sent for value in ("Đường Mẫu", "Phường Thử", "0901234567",
                                              "1999-02-03", "MA.TEST(42)"))
    assert "ho 2 ngày" in sent and "không sốt" in sent
    assert "[REDACTED]" in sent
    assert result and identifiers == original
    assert caplog.records == []
    captured = capsys.readouterr()
    assert captured.out == captured.err == ""


@pytest.mark.parametrize("field,private", [
    ("Họ và tên: ", "Nguyễn Văn An"), ("Họ tên: ", "Nguyễn Văn An"),
    ("BN ", "Trần Thị Bình"), ("Bệnh nhân ", "Lê Văn Cường"),
    ("Tên: ", "Đỗ Thị Dung"), ("Ho ten: ", "Nguyen Van An"),
    ("Địa chỉ: ", "12 Đường Mẫu, Phường Thử, Thành phố Mẫu"),
    ("Address: ", "42 Example Road, Test District"),
    ("Ngày sinh: ", "03/02/1999"), ("DOB: ", "1999-02-03"),
    ("CCCD: ", "012345678901"), ("CMND: ", "123456789"),
    ("BHYT: ", "DN4012345678901"), ("Mã bệnh nhân: ", "BN000042"),
    ("Phone: ", "090.123.4567"), ("Họ tên: ", "Nguyễn V. An"),
    ("patient_id: ", "12345678-1234-1234-1234-123456789abc"),
    ("Email: ", "patient.test@example.invalid"),
])
def test_labelled_identity_fields_are_masked_without_explicit_values(catalogue, field, private):
    client = MockLLMClient(OUTPUT)
    extract(catalogue, client, text=field + private + "; " + NOTE)
    assert private not in client.calls[0]["prompt"]
    assert NOTE in payload(client)["text"]


@pytest.mark.parametrize("private", [
    "0901234567", "+84 901 234 567", "(090) 123-45-67", "090.123.4567",
    "0123 4567 8901", "patient.test@example.invalid", "03/02/1999",
    "03.02.1999", "1999-02-03", "12345678-1234-1234-1234-123456789abc",
])
def test_unlabelled_contacts_dates_and_ids_are_masked(catalogue, private):
    client = MockLLMClient(OUTPUT)
    extract(catalogue, client, text=private + "; " + NOTE)
    assert private not in client.calls[0]["prompt"]
    assert NOTE in payload(client)["text"]


def test_unicode_and_whitespace_variations_cannot_bypass_known_value_mask(catalogue):
    client = MockLLMClient(OUTPUT)
    name = "Nguyễn Văn An"
    note = unicodedata.normalize("NFD", "NGUYỄN\u200b\tVĂN\u00a0AN") + "; " + NOTE
    extract(catalogue, client, text=note, identifiers=[name])
    assert "nguyễn" not in payload(client)["text"].casefold()
    assert NOTE in payload(client)["text"]


def test_partial_phone_or_name_fragments_do_not_survive_label_masking(catalogue):
    client = MockLLMClient(OUTPUT)
    extract(catalogue, client, text="Phone: 090.123.4567; Họ tên: Nguyễn V. An; " + NOTE)
    assert payload(client)["text"] == "[REDACTED]; [REDACTED]; " + NOTE


def test_identifier_values_are_literals_including_regex_metacharacters_and_overlaps(catalogue):
    client = MockLLMClient(OUTPUT)
    extract(catalogue, client, text="An (Mẫu)+; An; ho", identifiers=["An", "An (Mẫu)+"])
    assert payload(client)["text"] == "[REDACTED]; [REDACTED]; ho"


def test_prompt_projects_only_active_catalogue_codes_and_names(catalogue):
    rows = deepcopy(ROWS)
    for row in rows:
        row.update(patient_name="SYNTHETIC_PRIVATE_MARKER", notes="PRIVATE_NOTES", release_id="PRIVATE_ID")
    rows.extend({"symptom_code": f"hidden_{status.lower()}", "symptom_name": "HIDDEN_NAME", "status": status}
                for status in ("Draft", "PendingApproval", "Retired"))
    client = MockLLMClient({"symptoms": OUTPUT["symptoms"] + [
        {"symptom_code": code, "status": "PRESENT"}
        for code in ("hidden_draft", "hidden_pendingapproval", "hidden_retired", "invented_signal")
    ]})

    result = extract(catalogue, client, reader=FakeKnowledgeReader(symptoms=rows))

    assert codes_and_statuses(result) == codes_and_statuses(extract(catalogue))
    assert set(payload(client)) == {"text", "catalogue"}
    for private in ("SYNTHETIC_PRIVATE_MARKER", "PRIVATE_NOTES", "PRIVATE_ID", "HIDDEN_NAME"):
        assert private not in client.calls[0]["prompt"]


def test_extraction_never_mutates_state_or_adds_unconfirmed_features_to_node2(catalogue):
    reader = FakeKnowledgeReader(symptoms=ROWS, conditions=[{
        "condition_code": "synthetic_condition", "name_vi": "Bệnh giả lập",
        "symptoms": [{"symptom_code": "signal_a", "polarity": "SUPPORTS", "weight": 1}],
    }])
    gate = gated_state()
    original = deepcopy(gate)
    result = extract(catalogue, gate=gate, reader=reader)

    assert result
    assert gate == original
    # Even explicitly carrying tentative rows beside confirmed features must
    # not turn them into evidence for Node 2. Nurse confirmation is a later step.
    gate["input_features"]["extracted_symptoms"] = result
    assert run_node2(gate, reader)["candidates"] == []


def test_high_priority_from_node1_is_preserved(catalogue):
    gate = {**gated_state(), "priority_rule": "HighPriority", "priority_final": "HighPriority"}
    original = deepcopy(gate)
    assert extract(catalogue, gate=gate)
    assert gate == original


@pytest.mark.parametrize("output", [
    None, [], "{\"symptoms\": []}", {}, {"symptoms": None}, {"symptoms": {}},
    {"symptoms": [{}]}, {"symptoms": [{"symptom_code": "signal_a"}]},
    {"symptoms": [{"symptom_code": 7, "status": "PRESENT"}]},
    {"symptoms": [{"symptom_code": "signal_a", "status": True}]},
    {"symptoms": [{"symptom_code": "signal_a", "status": "present"}]},
    {"symptoms": [{"symptom_code": "signal_a", "status": "NEGATED"}]},
    {"symptoms": [{"symptom_code": "signal_a", "status": "PRESENT", "reason": "PRIVATE"}]},
    {**OUTPUT, "priority": "Emergency"}, {**OUTPUT, "confirmed": True},
    {**OUTPUT, "input_features": {"symptoms": {"signal_a": "PRESENT"}}},
])
def test_malformed_or_extra_generated_fields_are_rejected(catalogue, output):
    class Client(MockLLMClient):
        async def generate_json(self, **kwargs):
            self.calls.append(kwargs)
            return deepcopy(output)

    assert extract(catalogue, Client()) == []
    assert catalogue.calls == []


@pytest.mark.parametrize("code", ["", "Signal_A", " signal_a", "signal-a", "a" * 51, "a__b"])
def test_generated_codes_use_shared_slug_and_length_validator(catalogue, code):
    client = MockLLMClient({"symptoms": [{"symptom_code": code, "status": "PRESENT"}]})
    assert extract(catalogue, client) == []
    assert catalogue.calls == []


def test_duplicate_identical_statuses_are_deduplicated(catalogue):
    client = MockLLMClient({"symptoms": OUTPUT["symptoms"] * 2})
    result = extract(catalogue, client)
    assert len(result) == 3
    assert catalogue.calls == [["signal_a", "signal_b", "signal_c"]]


@pytest.mark.parametrize("conflicting", ["ABSENT", "UNKNOWN"])
def test_conflicting_statuses_discard_the_proposal(catalogue, conflicting):
    client = MockLLMClient({"symptoms": OUTPUT["symptoms"] + [
        {"symptom_code": "signal_a", "status": conflicting},
    ]})
    assert extract(catalogue, client) == []
    assert catalogue.calls == []


def test_unknown_or_empty_results_return_empty_without_catalogue_queries(catalogue):
    for output in ({"symptoms": []}, {"symptoms": [
        {"symptom_code": "invented_signal", "status": "PRESENT"},
    ]}):
        assert extract(catalogue, MockLLMClient(output)) == []
    assert catalogue.calls == []


def test_invalid_generated_text_is_not_logged_or_returned(catalogue, caplog, capsys):
    private = "SYNTHETIC_PRIVATE_MARKER"
    client = MockLLMClient({"symptoms": [{
        "symptom_code": "signal_a", "status": "PRESENT", "text": private,
    }]})
    assert extract(catalogue, client) == []
    assert catalogue.calls == []
    assert caplog.records == []
    captured = capsys.readouterr()
    assert captured.out == captured.err == ""


def test_shared_validator_rechecks_codes_retired_during_inference(catalogue):
    class RetiringClient(MockLLMClient):
        async def generate_json(self, **kwargs):
            catalogue.active.remove("signal_a")
            return await super().generate_json(**kwargs)

    assert extract(catalogue, RetiringClient(OUTPUT)) == []
    assert catalogue.calls == [["signal_a", "signal_b", "signal_c"]]


@pytest.mark.parametrize("error", [
    LLMTimeoutError("SYNTHETIC_PRIVATE_MARKER"), LLMConnectionError("SYNTHETIC_PRIVATE_MARKER"),
    LLMHTTPError(503), LLMInvalidJSONError("SYNTHETIC_PRIVATE_MARKER"),
    LLMResponseError("SYNTHETIC_PRIVATE_MARKER"), LLMConfigurationError("SYNTHETIC_PRIVATE_MARKER"),
    TimeoutError("SYNTHETIC_PRIVATE_MARKER"),
])
def test_typed_llm_failures_return_empty_without_retry_or_logging(catalogue, error, caplog, capsys):
    client = MockLLMClient(error=error)
    assert extract(catalogue, client) == []
    assert len(client.calls) == 1
    assert catalogue.calls == []
    assert caplog.records == []
    captured = capsys.readouterr()
    assert captured.out == captured.err == ""


def test_real_async_deadline_cancels_a_slow_client_without_retry(catalogue):
    class SlowClient(MockLLMClient):
        cancelled = False

        async def generate_json(self, **kwargs):
            self.calls.append(kwargs)
            try:
                await asyncio.Event().wait()
            finally:
                self.cancelled = True

    client = SlowClient()
    assert extract(catalogue, client, timeout_seconds=0.05) == []
    assert len(client.calls) == 1 and client.cancelled
    assert catalogue.calls == []


@pytest.fixture
def timer(monkeypatch):
    class Clock:
        now = 100.0

    clock = Clock()
    monkeypatch.setattr(feature_extractor, "monotonic", lambda: clock.now)
    return clock


@pytest.mark.parametrize("budget,expected", [(300, 30), (30, 30), (4.5, 4.5)])
def test_queue_budget_is_capped_at_30_seconds(catalogue, timer, budget, expected):
    client = MockLLMClient(OUTPUT)
    assert extract(catalogue, client, timeout_seconds=budget)
    assert client.calls[0]["timeout_seconds"] == expected


def test_preparation_consumes_the_existing_queue_budget(catalogue, timer):
    class Reader(FakeKnowledgeReader):
        def active_symptoms(self):
            timer.now += 3
            return super().active_symptoms()

    client = MockLLMClient(OUTPUT)
    assert extract(catalogue, client, reader=Reader(symptoms=ROWS), timeout_seconds=7)
    assert client.calls[0]["timeout_seconds"] == 4


def test_expiry_during_preparation_skips_the_llm(catalogue, timer):
    class Reader(FakeKnowledgeReader):
        def active_symptoms(self):
            timer.now += 30
            return super().active_symptoms()

    client = MockLLMClient(OUTPUT)
    assert extract(catalogue, client, reader=Reader(symptoms=ROWS), timeout_seconds=30) == []
    assert client.calls == catalogue.calls == []


def test_late_output_is_discarded_even_when_client_returns_without_timeout(catalogue, timer):
    class LateClient(MockLLMClient):
        async def generate_json(self, **kwargs):
            timer.now += 30
            return await super().generate_json(**kwargs)

    client = LateClient(OUTPUT)
    assert extract(catalogue, client, timeout_seconds=30) == []
    assert len(client.calls) == 1
    assert catalogue.calls == []


def test_expiry_during_active_validation_also_discards_result(catalogue, timer, monkeypatch):
    original = knowledge_validators.active_symptoms

    def slow_validation(db, codes):
        timer.now += 30
        return original(db, codes)

    monkeypatch.setattr(knowledge_validators, "active_symptoms", slow_validation)
    assert extract(catalogue, timeout_seconds=30) == []
    assert len(catalogue.calls) == 1


@pytest.mark.parametrize("budget", [0, -1])
def test_exhausted_queue_budget_skips_all_work(catalogue, budget):
    class Reader(FakeKnowledgeReader):
        def active_symptoms(self):
            raise AssertionError("Reader must not run")

    client = MockLLMClient(OUTPUT)
    assert extract(catalogue, client, reader=Reader(), timeout_seconds=budget) == []
    assert client.calls == catalogue.calls == []


@pytest.mark.parametrize("budget", [True, None, "30", float("inf"), float("nan")])
def test_invalid_budget_raises_fixed_configuration_error(catalogue, budget):
    client = MockLLMClient(OUTPUT)
    with pytest.raises(ValueError, match="finite seconds"):
        extract(catalogue, client, timeout_seconds=budget)
    assert client.calls == catalogue.calls == []


def test_external_worker_cancellation_propagates_and_cancels_inference(catalogue):
    class BlockingClient(MockLLMClient):
        cancelled = False

        async def generate_json(self, **kwargs):
            self.calls.append(kwargs)
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                self.cancelled = True

    async def exercise():
        nonlocal entered
        entered = asyncio.Event()
        task = asyncio.create_task(extract_symptoms(
            NOTE, FakeKnowledgeReader(symptoms=ROWS), client, catalogue.db,
            gate_state=gated_state(), identifiers=(), timeout_seconds=5,
        ))
        await asyncio.wait_for(entered.wait(), timeout=1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    entered = None
    client = BlockingClient()
    asyncio.run(exercise())
    assert client.cancelled and len(client.calls) == 1
    assert catalogue.calls == []


def test_cancellation_raised_by_client_is_not_treated_as_llm_failure(catalogue):
    class CancelledClient(MockLLMClient):
        async def generate_json(self, **kwargs):
            raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        extract(catalogue, CancelledClient())
    assert catalogue.calls == []


@pytest.mark.parametrize("terminal", [
    {"is_red_flag": True}, {"ai_status": "Skipped"},
    {"priority_rule": "Emergency"}, {"priority_final": "Emergency"},
])
def test_red_flag_gate_skips_all_ai_work(catalogue, terminal):
    class Reader(FakeKnowledgeReader):
        def active_symptoms(self):
            raise AssertionError("Reader must not run after red flag")

    gate = {**gated_state(), **terminal}
    original = deepcopy(gate)
    client = MockLLMClient(error=AssertionError("LLM must not run after red flag"))
    assert extract(catalogue, client, gate=gate, reader=Reader()) == []
    assert gate == original
    assert client.calls == catalogue.calls == []


@pytest.mark.parametrize("gate", [
    {}, {"input_features": {}},
    {"is_red_flag": False}, {"is_red_flag": 0, "priority_rule": "Routine", "priority_final": "Routine"},
    {"is_red_flag": False, "priority_rule": "Other", "priority_final": "Routine"},
])
def test_node1_must_run_before_extraction(catalogue, gate):
    client = MockLLMClient(OUTPUT)
    with pytest.raises(ValueError, match="Node 1"):
        extract(catalogue, client, gate=gate)
    assert client.calls == catalogue.calls == []


@pytest.mark.parametrize("text", ["", "  \n ", "0901234567", "Nguyễn Văn An"])
def test_empty_or_fully_masked_notes_skip_llm(catalogue, text):
    client = MockLLMClient(OUTPUT)
    assert extract(catalogue, client, text=text, identifiers=["Nguyễn Văn An"]) == []
    assert client.calls == catalogue.calls == []


def test_empty_active_catalogue_skips_llm(catalogue):
    client = MockLLMClient(OUTPUT)
    assert extract(catalogue, client, reader=FakeKnowledgeReader()) == []
    assert client.calls == catalogue.calls == []


@pytest.mark.parametrize("rows", [
    [{}], [{"symptom_code": "BAD_CODE"}], [{"symptom_code": "a" * 51}],
    [{"symptom_code": "signal_a", "symptom_name": None}],
    [{"symptom_code": "signal_a"}, {"symptom_code": "signal_a"}],
])
def test_invalid_reader_mapping_raises_sanitized_error_before_llm(catalogue, rows):
    client = MockLLMClient(OUTPUT)
    with pytest.raises(ValueError, match="Active symptom catalogue"):
        extract(catalogue, client, reader=FakeKnowledgeReader(symptoms=rows))
    assert client.calls == catalogue.calls == []


@pytest.mark.parametrize("text,identifiers", [
    (None, []), (7, []), (NOTE, None), (NOTE, "SYNTHETIC_PRIVATE_MARKER"),
    (NOTE, [None]), (NOTE, [""]), (NOTE, [" "]), (NOTE, ["\u200b"]),
])
def test_invalid_identity_input_fails_closed_without_echoing_values(catalogue, text, identifiers):
    client = MockLLMClient(OUTPUT)
    with pytest.raises(ValueError) as caught:
        extract(catalogue, client, text=text, identifiers=identifiers)
    assert "SYNTHETIC_PRIVATE_MARKER" not in "".join(traceback.format_exception(caught.value))
    assert client.calls == catalogue.calls == []


def test_infrastructure_and_programming_failures_propagate(catalogue):
    client = MockLLMClient(error=RuntimeError("synthetic programming failure"))
    with pytest.raises(RuntimeError, match="synthetic programming"):
        extract(catalogue, client)
    catalogue.error = AppError(503, "KNOWLEDGE_UNAVAILABLE", "synthetic infrastructure failure")
    with pytest.raises(AppError) as caught:
        extract(catalogue)
    assert caught.value is catalogue.error


def test_reader_failures_are_not_misreported_as_an_empty_extraction(catalogue):
    class Reader(FakeKnowledgeReader):
        def active_symptoms(self):
            raise RuntimeError("synthetic reader failure")

    client = MockLLMClient(OUTPUT)
    with pytest.raises(RuntimeError, match="synthetic reader"):
        extract(catalogue, client, reader=Reader())
    assert client.calls == catalogue.calls == []
