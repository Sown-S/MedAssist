"""LLM_PROVIDER=fake: kết quả tất định, nằm trong ứng viên Node 2 / catalog Active; cấm ở prod."""

import asyncio
import os

import pytest
from pydantic import ValidationError

from app.ai.extraction import compact_selection, dispatch
from app.ai.llm.errors import LLMConfigurationError, LLMTimeoutError
from app.ai.llm.fake_client import FakeLLMClient
from app.ai.llm.output_schemas import ReasoningOutput, reasoning_json_schema
from app.ai.llm.prompts import PHRASE_EXTRACTION_PROMPT_VERSION
from app.ai.pipeline.node3_reasoning import run_node3
from app.core.config import Settings
from tests.unit.ai.fakes import FakeKnowledgeReader
from tests.unit.ai.test_extraction import ROWS, catalogue, codes_and_statuses, extract, gated_state  # noqa: F401
from tests.unit.ai.test_node3 import retrieved_state


def test_reasoning_ranks_every_candidate_with_grounded_vietnamese_reason():
    state = retrieved_state(count=3)
    result = asyncio.run(run_node3(state, FakeLLMClient(), timeout_seconds=5))

    proposal = ReasoningOutput.model_validate(result["llm_output"], strict=True)
    assert [row.condition_code for row in proposal.ranking] == [
        c["condition_code"] for c in state["candidates"]]
    assert proposal.raise_priority is False
    for row, candidate in zip(proposal.ranking, state["candidates"]):
        evidence = {e["symptom_code"] for e in
                    candidate["supporting_evidence"] + candidate["contradicting_evidence"]}
        evidence |= set(candidate["unknown_key_symptoms"])
        assert row.reason.startswith("Gợi ý giả lập")
        assert any(code in row.reason for code in evidence)


def test_extraction_reads_present_absent_unknown_from_note(catalogue):  # noqa: F811
    result = extract(catalogue, FakeLLMClient(), text="Sốt 2 ngày, không ho; chưa rõ khó thở.")
    assert codes_and_statuses(result) == {
        "signal_a": "PRESENT", "signal_b": "ABSENT", "signal_c": "UNKNOWN"}


def test_extraction_matches_whole_words_only(catalogue):  # noqa: F811
    assert extract(catalogue, FakeLLMClient(), text="Dặn cho uống nhiều nước.") == []


@pytest.mark.parametrize(("text", "prompt_version"), [
    ("Sốt 2 ngày. Không ho. Chưa rõ khó thở.", PHRASE_EXTRACTION_PROMPT_VERSION),
    ("Sốt 2 ngày. Không ho. Chưa rõ khó thở. Dặn cho uống nước.", compact_selection.PROMPT_VERSION),
])
def test_fake_extraction_through_default_dispatch(catalogue, text, prompt_version):  # noqa: F811
    result = asyncio.run(dispatch.run_extraction(
        text, FakeKnowledgeReader(symptoms=ROWS), FakeLLMClient(), catalogue.db,
        gate_state=gated_state(), identifiers=[], timeout_seconds=5,
    ))

    assert result.strategy == "phrases"
    assert result.completed is True and result.failure_code is None
    assert result.prompt_version == prompt_version
    assert codes_and_statuses(result.suggestions) == {
        "signal_a": "PRESENT", "signal_b": "ABSENT", "signal_c": "UNKNOWN",
    }
    assert all(row["requires_confirmation"] for row in result.suggestions)


def test_unsupported_schema_and_exhausted_budget():
    client = FakeLLMClient()
    with pytest.raises(LLMConfigurationError):
        asyncio.run(client.generate_json(prompt="x\n{}", schema={"title": "Other"}, timeout_seconds=5))
    with pytest.raises(LLMTimeoutError):
        asyncio.run(client.generate_json(prompt="x\n{}", schema=reasoning_json_schema(), timeout_seconds=0))


def _settings(**overrides):
    return Settings(_env_file=None, DATABASE_URL=os.environ["DATABASE_URL"],
                    JWT_SECRET_KEY="k" * 40, **overrides)


def test_fake_provider_rejected_in_prod():
    assert _settings(ENVIRONMENT="dev", LLM_PROVIDER="fake").LLM_PROVIDER == "fake"
    with pytest.raises(ValidationError, match="LLM_PROVIDER=fake"):
        _settings(ENVIRONMENT="prod", LLM_PROVIDER="fake")
