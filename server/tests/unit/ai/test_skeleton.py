"""AI-00 package, protocols, shared state, and test doubles."""

import asyncio
from typing import get_type_hints

from app.ai.interfaces import KnowledgeReader, LLMClient
from app.ai.pipeline.state import PipelineState
from tests.unit.ai.fakes import FakeKnowledgeReader, FakeLLMClient


def test_fake_knowledge_reader_satisfies_protocol_and_isolates_data():
    source = {"rule_key": "rf_test"}
    reader = FakeKnowledgeReader(triage_rules=[source])

    assert isinstance(reader, KnowledgeReader)
    returned = reader.active_triage_rules()
    returned[0]["rule_key"] = "changed"
    assert reader.active_triage_rules() == [{"rule_key": "rf_test"}]


def test_fake_llm_client_satisfies_protocol_and_records_calls():
    client = FakeLLMClient({"ranking": ["condition_a"]})

    assert isinstance(client, LLMClient)
    result = asyncio.run(
        client.generate_json(
            prompt="test prompt",
            schema={"type": "object"},
            timeout_seconds=1.5,
        )
    )
    assert result == {"ranking": ["condition_a"]}
    assert client.calls == [
        {
            "prompt": "test prompt",
            "schema": {"type": "object"},
            "timeout_seconds": 1.5,
        }
    ]


def test_pipeline_state_requires_only_input_features():
    state: PipelineState = {"input_features": {"symptoms": {"fever": "PRESENT"}}}

    assert state["input_features"]["symptoms"]["fever"] == "PRESENT"
    assert PipelineState.__required_keys__ == frozenset({"input_features"})
    assert {"priority_rule", "candidates", "llm_output"} <= set(get_type_hints(PipelineState))


def test_ai_package_does_not_depend_on_http_routers():
    import app.ai.interfaces as interfaces
    import app.ai.pipeline.state as state

    assert "routers" not in interfaces.__dict__
    assert "routers" not in state.__dict__
