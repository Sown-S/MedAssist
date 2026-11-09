"""Chọn đúng strategy/metadata; không retry hoặc coi legacy rỗng là thành công."""

import asyncio

import pytest

from app.ai.extraction import dispatch
from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction.phrase_selector import SelectionResult
from app.ai.llm.prompts import EXTRACTION_PROMPT_VERSION, PHRASE_EXTRACTION_PROMPT_VERSION


@pytest.mark.parametrize("strategy,limit", [("wrong", 4), (None, 4), ("phrases", 0),
                                         ("phrases", -1), ("phrases", True), ("phrases", 4.0)])
def test_invalid_configuration_is_rejected(strategy, limit):
    with pytest.raises(ValueError):
        dispatch.ExtractionOptions(strategy=strategy, per_phrase_limit=limit)


@pytest.mark.parametrize("strategy", ["legacy", "phrases"])
def test_one_branch_receives_same_gate_reader_identifiers_and_remaining_budget(monkeypatch, strategy):
    reader, client, db, cache = object(), object(), object(), CandidateIndexCache()
    gate, identifiers = {"is_red_flag": False}, ["PRIVATE_NAME"]
    calls = []
    suggestion = {"symptom_code": "cough_dry", "status": "ABSENT",
                  "requires_confirmation": True, "label": "Reference Suggestion"}

    async def selected(*args, **kwargs):
        assert args == ("PRIVATE_NOTE", reader, client, db)
        assert kwargs["gate_state"] is gate and kwargs["identifiers"] is identifiers
        assert kwargs["timeout_seconds"] == 7.5
        if strategy == "phrases":
            assert kwargs["cache"] is cache and kwargs["per_phrase_limit"] == 8
        calls.append(kwargs)
        return SelectionResult(True, suggestions=(suggestion,)) if strategy == "phrases" else [suggestion]

    async def forbidden(*args, **kwargs):
        pytest.fail("Unselected extractor must never run")

    monkeypatch.setattr(dispatch.feature_extractor, "extract_symptoms", selected if strategy == "legacy" else forbidden)
    monkeypatch.setattr(dispatch.phrase_selector, "select_phrase_symptoms", selected if strategy == "phrases" else forbidden)
    result = asyncio.run(dispatch.run_extraction(
        "PRIVATE_NOTE", reader, client, db, gate_state=gate, identifiers=identifiers,
        timeout_seconds=7.5, options=dispatch.ExtractionOptions(strategy, 8), cache=cache,
    ))
    assert len(calls) == 1 and result.strategy == strategy and result.completed is True
    assert result.prompt_version == (PHRASE_EXTRACTION_PROMPT_VERSION if strategy == "phrases" else EXTRACTION_PROMPT_VERSION)
    assert result.suggestions == (suggestion,)
    assert "PRIVATE_" not in repr(result) and "cough_dry" not in repr(result)


def test_default_is_legacy_and_empty_has_unknown_completion(monkeypatch):
    async def empty(*args, **kwargs):
        return []
    monkeypatch.setattr(dispatch.feature_extractor, "extract_symptoms", empty)
    result = asyncio.run(dispatch.run_extraction(
        "", None, None, None, gate_state={}, identifiers=[], timeout_seconds=30,
    ))
    assert result.strategy == "legacy" and result.completed is None
    assert result.failure_code == "LEGACY_EMPTY_UNCLASSIFIED" and not result.suggestions


@pytest.mark.parametrize("completed,reason", [(True, None), (False, "UNMAPPED_PHRASE"),
                                             (False, "EXTRACTION_TIMEOUT"), (False, "RED_FLAG_SKIPPED")])
def test_phrase_empty_retains_actual_outcome_without_legacy_fallback(monkeypatch, completed, reason):
    async def phrase(*args, **kwargs):
        return SelectionResult(completed, reason)
    async def forbidden(*args, **kwargs):
        pytest.fail("No automatic legacy retry")
    monkeypatch.setattr(dispatch.phrase_selector, "select_phrase_symptoms", phrase)
    monkeypatch.setattr(dispatch.feature_extractor, "extract_symptoms", forbidden)
    result = asyncio.run(dispatch.run_extraction(
        "", None, None, None, gate_state={}, identifiers=[], timeout_seconds=1,
        options=dispatch.ExtractionOptions("phrases"),
    ))
    assert result.completed is completed and result.failure_code == reason
    assert result.suggestions == ()


@pytest.mark.parametrize("strategy", ["legacy", "phrases"])
def test_cancellation_propagates(monkeypatch, strategy):
    async def cancelled(*args, **kwargs):
        raise asyncio.CancelledError()
    monkeypatch.setattr(dispatch.feature_extractor, "extract_symptoms", cancelled)
    monkeypatch.setattr(dispatch.phrase_selector, "select_phrase_symptoms", cancelled)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(dispatch.run_extraction(
            "", None, None, None, gate_state={}, identifiers=[], timeout_seconds=1,
            options=dispatch.ExtractionOptions(strategy),
        ))
