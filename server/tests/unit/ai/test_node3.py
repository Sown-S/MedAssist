"""AI-06: reasoning giả lập trong worker, dùng MockLLM và không gọi model thật."""

import asyncio
from copy import deepcopy
import json
import traceback

import pytest

from app.ai.llm.client import (
    LLMConfigurationError,
    LLMConnectionError,
    LLMHTTPError,
    LLMInvalidJSONError,
    LLMResponseError,
    LLMTimeoutError,
)
from app.ai.llm.output_schemas import ReasoningOutput, reasoning_json_schema
from app.ai.llm.prompts import REASONING_PROMPT_VERSION, load_prompt
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.pipeline.node2_graph_retrieval import run_node2
from app.ai.pipeline.node3_reasoning import run_node3
from tests.unit.ai.fakes import FakeKnowledgeReader, MockLLMClient

OUTPUT = {
    "ranking": [
        {"condition_code": "condition_b", "reason": "Có bằng chứng hỗ trợ phù hợp."},
        {"condition_code": "condition_a", "reason": "Còn bằng chứng phản bác."},
    ],
    "raise_priority": False,
}


def retrieved_state(*, priority="Routine", count=2):
    reader = FakeKnowledgeReader(
        conditions=[
            {
                "condition_code": f"condition_{letter}",
                "name_vi": f"Bệnh thử nghiệm {letter}",
                "icd10_code": "TEST",
                "symptoms": [
                    {"symptom_code": "signal_a", "polarity": "SUPPORTS", "weight": 1},
                    {"symptom_code": "signal_b", "polarity": "CONTRADICTS", "weight": 0.5},
                    {"symptom_code": "signal_c", "polarity": "SUPPORTS", "weight": 1,
                     "is_key": True},
                ],
                "guidelines": [{
                    "excerpt_key": "synthetic_guide",
                    "title": "Khuyến cáo giả lập",
                    "content": "Tri thức giả lập.",
                    "source_title": "Nguồn giả lập",
                    "source_locator": None,
                }],
            }
            for letter in "abcd"[:count]
        ],
        symptoms=[{"symptom_code": code} for code in ("signal_a", "signal_b", "signal_c")],
    )
    state = run_node1({"input_features": {
        "symptoms": {"signal_a": "PRESENT", "signal_b": "PRESENT"},
    }}, reader)
    state.update(priority_rule=priority, priority_final=priority)
    return run_node2(state, reader)


def reason(state, client=None, *, timeout_seconds=12.5):
    return asyncio.run(run_node3(
        state, client if client is not None else MockLLMClient(OUTPUT),
        timeout_seconds=timeout_seconds,
    ))


def payload(client):
    prefix = load_prompt(REASONING_PROMPT_VERSION) + "\n"
    prompt = client.calls[0]["prompt"]
    assert prompt.startswith(prefix)
    return json.loads(prompt[len(prefix):])


def test_node1_node2_node3_send_closed_candidates_and_existing_evidence():
    state = retrieved_state()
    original = deepcopy(state)
    client = MockLLMClient(OUTPUT)

    result = reason(state, client)

    assert state == original
    assert result is not state
    assert len(client.calls) == 1
    assert client.calls[0]["schema"] == reasoning_json_schema([c["condition_code"] for c in state["candidates"]])
    assert client.calls[0]["timeout_seconds"] == 12.5
    data = payload(client)
    assert data["priority_rule"] == data["priority_final"] == "Routine"
    assert [item["condition_code"] for item in data["candidates"]] == ["condition_a", "condition_b"]
    for sent, candidate in zip(data["candidates"], state["candidates"], strict=True):
        for key in ("score", "coverage", "precision", "supporting_evidence",
                    "contradicting_evidence", "unknown_key_symptoms"):
            assert sent[key] == candidate[key]
        assert sent["supporting_evidence"][0]["symptom_code"] == "signal_a"
        assert sent["contradicting_evidence"][0]["symptom_code"] == "signal_b"
        assert sent["unknown_key_symptoms"] == ["signal_c"]
    assert result["llm_output"] == OUTPUT
    assert ReasoningOutput.model_validate(result["llm_output"]).ranking[0].reason
    # Xếp hạng chỉ là đề xuất; giữ nguyên ứng viên/bằng chứng tất định.
    assert result["candidates"] == original["candidates"]
    assert result["priority_final"] == "Routine"
    assert result["ai_status"] == "Pending"
    assert "validation_result" not in result


def test_four_internal_candidates_are_sent_without_applying_the_display_limit():
    state = retrieved_state(count=4)
    response = {"ranking": [
        {"condition_code": candidate["condition_code"], "reason": "Bằng chứng giả lập."}
        for candidate in reversed(state["candidates"])
    ], "raise_priority": False}
    client = MockLLMClient(response)

    result = reason(state, client)

    assert len(payload(client)["candidates"]) == 4
    assert result["llm_output"] == response
    assert len(result["candidates"]) == 4


def test_request_schema_limits_codes_and_keeps_independent_default_schema():
    schema = reasoning_json_schema(["condition_a", "condition_b"])
    assert schema["properties"]["ranking"]["minItems"] == 2
    assert schema["properties"]["ranking"]["maxItems"] == 2
    code_schema = schema["$defs"]["RankedCondition"]["properties"]["condition_code"]
    assert code_schema["enum"] == ["condition_a", "condition_b"]
    assert "enum" not in reasoning_json_schema()["$defs"]["RankedCondition"]["properties"]["condition_code"]
    assert REASONING_PROMPT_VERSION == "reasoning-v3"
    assert "[symptom_code]" in load_prompt(REASONING_PROMPT_VERSION)
    assert "reasoning-v1" in load_prompt("reasoning-v1")
    assert "reasoning-v2" in load_prompt("reasoning-v2")
    assert "không tự viết lại tên bệnh" in load_prompt(REASONING_PROMPT_VERSION)


@pytest.mark.parametrize("priority", ["Routine", "HighPriority"])
@pytest.mark.parametrize("raise_priority", [False, True])
def test_priority_is_preserved_until_node4_validates_the_proposal(priority, raise_priority):
    state = retrieved_state(priority=priority)
    response = {**deepcopy(OUTPUT), "raise_priority": raise_priority}

    result = reason(state, MockLLMClient(response))

    assert result["llm_output"]["raise_priority"] is raise_priority
    assert result["priority_rule"] == result["priority_final"] == priority
    assert result["is_red_flag"] is False


def test_prompt_excludes_identifiers_raw_features_and_unrecognized_nested_metadata(caplog, capsys):
    state = retrieved_state()
    private = "SYNTHETIC_PRIVATE_MARKER_0900000000"
    state["input_features"].update(
        full_name=private, phone=private, visit_id=private,
        vital_signs={"temperature": 38.5}, clinical_notes=private,
        symptoms={"unconfirmed_free_text": private},
    )
    state.update(patient_id=private, notes=private, rule_hits=[{"reason": private}])
    for candidate in state["candidates"]:
        candidate.update(patient_name=private, name_vi=private, icd10_code=private,
                         guidelines=[{"excerpt": private}])
        for key in ("supporting_evidence", "contradicting_evidence"):
            candidate[key][0].update(patient_name=private, notes=private)
    client = MockLLMClient(OUTPUT)
    original = deepcopy(state)

    reason(state, client)

    prompt = client.calls[0]["prompt"]
    assert private not in prompt
    assert "38.5" not in prompt
    assert "unconfirmed_free_text" not in prompt
    assert set(payload(client)) == {"priority_rule", "priority_final", "candidates"}
    assert state == original
    assert caplog.records == []
    captured = capsys.readouterr()
    assert captured.out == captured.err == ""


@pytest.mark.parametrize("terminal", [
    {"is_red_flag": True}, {"ai_status": "Skipped"},
    {"priority_rule": "Emergency"}, {"priority_final": "Emergency"},
])
def test_terminal_safety_states_never_call_llm_or_retain_diagnoses(terminal):
    state = retrieved_state()
    state.update(llm_output=deepcopy(OUTPUT), validation_result={"valid": True}, error="old")
    state.update(terminal)
    original = deepcopy(state)
    client = MockLLMClient(error=AssertionError("LLM must not run after red flag"))

    result = reason(state, client)

    assert client.calls == []
    assert not {"candidates", "llm_output", "validation_result", "error"}.intersection(result)
    for key, value in terminal.items():
        assert result[key] == value
    assert state == original


@pytest.mark.parametrize("missing", ["is_red_flag", "priority_rule", "priority_final"])
def test_node1_is_required_before_reasoning(missing):
    state = retrieved_state()
    state.pop(missing)
    client = MockLLMClient(OUTPUT)

    with pytest.raises(ValueError, match="Node 1"):
        reason(state, client)
    assert client.calls == []


@pytest.mark.parametrize("field,value", [
    ("is_red_flag", None), ("is_red_flag", 0),
    ("priority_rule", "Unknown"), ("priority_final", "Unknown"),
])
def test_invalid_safety_gate_state_does_not_call_llm(field, value):
    state = retrieved_state()
    state[field] = value
    client = MockLLMClient(OUTPUT)

    with pytest.raises(ValueError, match="Node 1"):
        reason(state, client)
    assert client.calls == []


@pytest.mark.parametrize("candidates", [None, {}, "invalid", [None] * 5])
def test_node2_candidate_list_is_required_and_capped(candidates):
    state = retrieved_state()
    state["candidates"] = candidates
    client = MockLLMClient(OUTPUT)

    with pytest.raises(ValueError, match="Node 2"):
        reason(state, client)
    assert client.calls == []


def test_missing_node2_result_does_not_call_llm():
    state = retrieved_state()
    state.pop("candidates")
    client = MockLLMClient(OUTPUT)

    with pytest.raises(ValueError, match="Node 2"):
        reason(state, client)
    assert client.calls == []


def test_empty_retrieval_skips_llm_and_discards_stale_untrusted_output():
    state = retrieved_state(count=0)
    state.update(llm_output=deepcopy(OUTPUT), validation_result={"valid": True}, error="old")
    original = deepcopy(state)
    client = MockLLMClient(OUTPUT)

    result = reason(state, client)

    assert client.calls == []
    assert result["candidates"] == []
    assert not {"llm_output", "validation_result", "error"}.intersection(result)
    assert state == original


def test_repeated_reasoning_clears_stale_validation_and_error():
    state = retrieved_state()
    state.update(llm_output={"old": True}, validation_result={"valid": True}, error="old")
    original = deepcopy(state)

    result = reason(state)

    assert result["llm_output"] == OUTPUT
    assert not {"validation_result", "error"}.intersection(result)
    assert state == original


@pytest.mark.parametrize("untrusted", [
    {"ranking": [{"condition_code": "outside_candidates", "reason": "Bịa."}],
     "raise_priority": True},
    {"ranking": [{"condition_code": "condition_a", "reason": "Bịa.",
                  "supporting_evidence": ["invented_signal"]}], "raise_priority": False},
    {"priority_final": "Emergency", "ranking": [], "raise_priority": True},
    {"ranking": "invalid", "raise_priority": "yes"},
])
def test_untrusted_output_is_reserved_for_node4_without_altering_safe_state(untrusted):
    state = retrieved_state(priority="HighPriority")
    original = deepcopy(state)

    result = reason(state, MockLLMClient(untrusted))

    assert result["llm_output"] == untrusted
    assert result["candidates"] == original["candidates"]
    assert result["priority_rule"] == result["priority_final"] == "HighPriority"
    assert result["ai_status"] == "Pending"
    assert "validation_result" not in result


@pytest.mark.parametrize("error", [
    LLMTimeoutError("Time budget exhausted."), LLMConnectionError("Unavailable."),
    LLMHTTPError(503), LLMInvalidJSONError("Invalid JSON."),
    LLMResponseError("Incomplete response."), LLMConfigurationError("Invalid config."),
])
def test_typed_client_errors_propagate_without_retry_for_rule_only_fallback(error, caplog):
    state = retrieved_state()
    original = deepcopy(state)
    client = MockLLMClient(error=error)

    with pytest.raises(type(error)) as caught:
        reason(state, client, timeout_seconds=0.25)

    assert caught.value is error
    assert len(client.calls) == 1
    assert client.calls[0]["timeout_seconds"] == 0.25
    assert state == original
    assert caplog.records == []


def test_worker_cancellation_is_not_swallowed_or_retried():
    class CancelledClient(MockLLMClient):
        async def generate_json(self, **kwargs):
            self.calls.append(kwargs)
            raise asyncio.CancelledError

    state = retrieved_state()
    original = deepcopy(state)
    client = CancelledClient()

    with pytest.raises(asyncio.CancelledError):
        reason(state, client)
    assert len(client.calls) == 1
    assert state == original


@pytest.mark.parametrize("bad_candidate", [
    None, {}, {"condition_code": "SYNTHETIC_PRIVATE_MARKER"},
])
def test_malformed_node2_data_raises_sanitized_error_before_calling_llm(bad_candidate):
    state = retrieved_state()
    state["candidates"] = [bad_candidate]
    client = MockLLMClient(OUTPUT)

    with pytest.raises(LLMConfigurationError) as caught:
        reason(state, client)

    assert client.calls == []
    assert "SYNTHETIC_PRIVATE_MARKER" not in "".join(traceback.format_exception(caught.value))


@pytest.mark.parametrize("invalid_score", [float("nan"), float("inf"), object()])
def test_non_json_prompt_values_are_rejected_without_echoing_data(invalid_score):
    state = retrieved_state()
    state["candidates"][0]["score"] = invalid_score
    client = MockLLMClient(OUTPUT)

    with pytest.raises(LLMConfigurationError, match="Invalid Node 2"):
        reason(state, client)
    assert client.calls == []
