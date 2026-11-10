"""ID ngắn phải giữ phạm vi ứng viên, trạng thái, ngữ cảnh và kiểm tra an toàn."""

import json
from time import monotonic

import pytest

from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction.compact_selection import decode_selection, selection_request
from app.ai.extraction.phrase_retrieval import retrieve_phrases
from app.ai.extraction.phrase_selector import validate_selection
from app.ai.llm.client import LLMResponseError
from tests.unit.ai.fakes import FakeKnowledgeReader


def plan_for(text="Ho khan; không ho khan."):
    reader = FakeKnowledgeReader(symptoms=[{"symptom_code": "cough_dry", "symptom_name": "Ho khan"}])
    return retrieve_phrases(
        text, reader, CandidateIndexCache(), identifiers=["PRIVATE_NAME"], per_phrase_limit=1, deadline=monotonic() + 5
    )


def test_compact_preserves_states_and_rejects_conflicts():
    plan = plan_for()
    decoded = decode_selection({"p1": ["c1:P"], "p2": ["c1:A"], "unmapped": []}, plan)
    assert decoded["p1"] == [{"symptom_code": "cough_dry", "status": "PRESENT"}]
    assert decoded["p2"] == [{"symptom_code": "cough_dry", "status": "ABSENT"}]
    assert validate_selection(decoded, plan).failure_code == "CONFLICTING_SELECTION"
    decoded = decode_selection({"p1": ["c1:U"], "p2": [], "unmapped": []}, plan)
    result = validate_selection(decoded, plan)
    assert result.completed and result.suggestions[0]["status"] == "UNKNOWN"
    assert result.suggestions[0]["requires_confirmation"] is True


@pytest.mark.parametrize(
    "output",
    [
        None,
        [],
        {},
        {"p1": [], "unmapped": []},
        {"p1": [], "p2": [], "unmapped": [], "extra": 1},
        {"p1": ["c99:P"], "p2": [], "unmapped": []},
        {"p1": ["c1:X"], "p2": [], "unmapped": []},
        {"p1": ["c1:P", "c1:P"], "p2": [], "unmapped": []},
        {"p1": ["c1:P", "c1:A"], "p2": [], "unmapped": []},
        {"p1": [], "p2": [], "unmapped": ["p3"]},
        {"p1": [], "p2": [], "unmapped": ["p1", "p1"]},
        {"p1": [], "p2": [], "unmapped": [{}]},
        {"p1": [{}], "p2": [], "unmapped": []},
    ],
)
def test_invalid_compact_output_is_rejected_without_echo(output):
    with pytest.raises(LLMResponseError, match="^Invalid compact selection.$"):
        decode_selection(output, plan_for())


def test_unmapped_and_empty_remain_distinct():
    plan = plan_for()
    result = validate_selection(decode_selection({"p1": [], "p2": [], "unmapped": ["p1"]}, plan), plan)
    assert result.failure_code == "UNMAPPED_PHRASE"
    result = validate_selection(decode_selection({"p1": [], "p2": [], "unmapped": []}, plan), plan)
    assert result.completed and result.suggestions == ()


def test_identical_repetitions_share_selection_without_losing_original_groups():
    plan = plan_for("Ho khan; Ho khan; không ho khan.")
    prompt, schema = selection_request(plan)
    payload = json.loads(prompt.rsplit("\n", 1)[1])
    assert len(payload["groups"]) == 2
    decoded = decode_selection({"p1": ["c1:P"], "p2": ["c1:A"], "unmapped": []}, plan)
    assert set(decoded) == {"p1", "p2", "p3", "unmapped"}
    assert decoded["p1"] == decoded["p2"]
    assert decoded["p3"][0]["status"] == "ABSENT"
    assert schema["additionalProperties"] is False


def test_contexts_are_shared_and_pii_redacted():
    plan = plan_for("PRIVATE_NAME có ho khan, không ho khan.")
    prompt, _ = selection_request(plan)
    payload = json.loads(prompt.rsplit("\n", 1)[1])
    assert "PRIVATE_NAME" not in prompt and "[REDACTED]" in prompt
    assert len(payload["sentences"]) == 1 and len(payload["groups"]) == 2
    assert all(group["sentence"] == "s1" for group in payload["groups"].values())


def test_same_phrase_with_different_context_is_kept_separate():
    plan = plan_for("Ho khan, không ho khan; Ho khan, có ho khan.")
    prompt, _ = selection_request(plan)
    payload = json.loads(prompt.rsplit("\n", 1)[1])
    assert len(payload["groups"]) == len(plan.groups)
