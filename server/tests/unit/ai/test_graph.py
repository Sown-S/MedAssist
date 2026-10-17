"""AI-08: real LangGraph orchestration with synthetic knowledge/LLM/catalogues."""

import asyncio
import builtins
from copy import deepcopy
import json
from threading import get_ident

import pytest

from app.ai.llm.client import (
    LLMConfigurationError,
    LLMConnectionError,
    LLMHTTPError,
    LLMInvalidJSONError,
    LLMResponseError,
    LLMTimeoutError,
)
from app.ai.pipeline import graph
from app.exceptions import AppError
from app.validation import knowledge_validators
from tests.unit.ai.fakes import FakeKnowledgeReader, MockLLMClient


def triage_rule(kind="RED_FLAG"):
    return {
        "rule_key": "synthetic_gate",
        "version": 7,
        "rule_type": kind,
        "reason_text": "Luật giả lập.",
        "resulting_priority": "Emergency" if kind == "RED_FLAG" else "HighPriority",
        "condition_logic": {
            "type": "vital_sign", "key": "spo2_pct", "operator": "lt", "value": 90,
        } if kind == "RED_FLAG" else {
            "type": "symptom", "code": "signal_a", "status": "PRESENT",
        },
        "status": "Active",
    }


def output(*, raise_priority=False):
    return {
        "ranking": [
            {"condition_code": f"condition_{letter}", "reason": "Lý do giả lập."}
            for letter in "dcba"
        ],
        "raise_priority": raise_priority,
    }


@pytest.fixture
def case(monkeypatch):
    """Exercise all nodes; only the reader, model and catalogue I/O are fake."""
    events = []
    calling_thread = get_ident()

    class Reader(FakeKnowledgeReader):
        def active_triage_rules(self):
            assert get_ident() == calling_thread
            events.append("gate")
            return super().active_triage_rules()

        def active_conditions(self):
            assert get_ident() == calling_thread
            events.append("conditions")
            return super().active_conditions()

        def active_symptoms(self):
            assert get_ident() == calling_thread
            events.append("symptoms")
            return super().active_symptoms()

    class Client(MockLLMClient):
        async def generate_json(self, **kwargs):
            events.append("llm")
            return await super().generate_json(**kwargs)

    class Case:
        db = object()  # No query/transaction methods: the graph cannot persist.

        def __init__(self):
            self.events = events
            self.catalogue_calls = []
            self.active_conditions = {f"condition_{letter}" for letter in "abcd"}
            self.active_symptoms = {"signal_a", "signal_b"}
            self.reader = Reader(
                conditions=[{
                    "condition_code": f"condition_{letter}",
                    "name_vi": f"Bệnh giả lập {letter}",
                    "icd10_code": "TEST",
                    "symptoms": [
                        {"symptom_code": "signal_a", "polarity": "SUPPORTS", "weight": 1},
                        {"symptom_code": "signal_b", "polarity": "SUPPORTS", "weight": 1,
                         "is_key": True},
                    ],
                    "guidelines": [{"excerpt_key": "synthetic_guide", "excerpt": "Giả lập."}],
                } for letter in "abcd"],
                symptoms=[{"symptom_code": "signal_a"}, {"symptom_code": "signal_b"}],
            )
            self.client = Client(output())
            self.state = {"input_features": {
                "symptoms": {"signal_a": "PRESENT"},
                "vital_signs": {"spo2_pct": 98},
                "patient_name": "SYNTHETIC_PRIVATE_MARKER",
                "free_text": "SYNTHETIC_PRIVATE_MARKER",
            }}

        async def run(self, *, timeout_seconds=5, on_preliminary=None):
            return await graph.run_pipeline(
                self.state, self.reader, self.client, self.db,
                timeout_seconds=timeout_seconds, on_preliminary=on_preliminary,
            )

        def conditions_validator(self, db, codes):
            assert db is self.db
            assert get_ident() == calling_thread
            events.append("validate_conditions")
            self.catalogue_calls.append(("conditions", list(codes)))
            if not set(codes) <= self.active_conditions:
                raise AppError(422, "UNKNOWN_CONDITION", "SYNTHETIC_PRIVATE_MARKER")
            return set(codes)

        def symptoms_validator(self, db, codes):
            assert db is self.db
            assert get_ident() == calling_thread
            events.append("validate_symptoms")
            self.catalogue_calls.append(("symptoms", list(codes)))
            if not set(codes) <= self.active_symptoms:
                raise AppError(422, "UNKNOWN_SYMPTOM", "SYNTHETIC_PRIVATE_MARKER")
            return dict.fromkeys(codes)

    instance = Case()
    monkeypatch.setattr(knowledge_validators, "active_condition_codes", instance.conditions_validator)
    monkeypatch.setattr(knowledge_validators, "active_symptoms", instance.symptoms_validator)
    return instance


def assert_rule_only(result, code, *, priority="Routine"):
    assert result["ai_status"] == "Degraded"
    assert result["mode"] == "RuleOnly"
    assert result["priority_rule"] == result["priority_final"] == priority
    assert result["validation_result"] == {
        "valid": False, "errors": [code], "schema_version": "1",
    }
    assert result["error"] == code
    assert "llm_output" not in result
    assert [c["condition_code"] for c in result["candidates"]] == [
        "condition_a", "condition_b", "condition_c",
    ]
    assert all("reason" not in c and c["label"] == "Reference Suggestion"
               for c in result["candidates"])


def test_success_runs_gate_retrieval_preliminary_reasoning_validation_in_order(case):
    original = deepcopy(case.state)
    snapshots = []

    async def preliminary(state):
        case.events.append("preliminary")
        snapshots.append(deepcopy(state))

    result = asyncio.run(case.run(on_preliminary=preliminary))

    assert case.events == [
        "gate", "conditions", "symptoms", "preliminary", "llm",
        "validate_conditions", "validate_symptoms",
    ]
    assert result["ai_status"] == "Completed"
    assert result["mode"] == "Full"
    assert result["priority_rule"] == result["priority_final"] == "Routine"
    assert result["validation_result"] == {"valid": True, "errors": [], "schema_version": "1"}
    assert "llm_output" not in result  # Deletion must survive LangGraph state merging.
    assert "preliminary" not in result
    assert "error" not in result
    assert [c["condition_code"] for c in result["candidates"]] == [
        "condition_d", "condition_c", "condition_b",
    ]
    assert len(snapshots) == 1
    snapshot = snapshots[0]
    assert snapshot["ai_status"] == "Preliminary"
    assert snapshot["mode"] == "RuleOnly"
    assert [c["condition_code"] for c in snapshot["candidates"]] == [
        "condition_a", "condition_b", "condition_c",
    ]
    assert all("reason" not in c for c in snapshot["candidates"])
    assert all(c["label"] == "Reference Suggestion" for c in result["candidates"])
    assert all(c["reason"] == "Lý do giả lập." for c in result["candidates"])
    assert case.catalogue_calls[0] == (
        "conditions", [f"condition_{letter}" for letter in "abcd"],
    )
    assert case.state == original
    result["input_features"]["symptoms"]["signal_a"] = "ABSENT"
    result["candidates"][1]["supporting_evidence"][0]["weight"] = 0.1
    result["candidates"][1]["guidelines"][0]["excerpt"] = "Changed"
    assert case.state == original
    assert snapshot["candidates"][2]["supporting_evidence"][0]["weight"] == 1


def test_red_flag_exits_before_graph_llm_catalogue_or_preliminary(case, monkeypatch):
    case.reader._triage_rules = [triage_rule()]
    case.state["input_features"]["vital_signs"]["spo2_pct"] = 80
    case.state.update(
        candidates=[{"condition_code": "stale"}], llm_output=output(),
        ai_status="Completed", mode="Full", error="STALE", validation_result={"valid": True},
    )
    original = deepcopy(case.state)
    original_import = builtins.__import__

    def guard_import(name, *args, **kwargs):
        if name.startswith(("langgraph", "langsmith", "app.ai.llm", "app.ai.pipeline.node2",
                            "app.ai.pipeline.node3", "app.ai.pipeline.node4")):
            raise AssertionError("Red flag must exit before loading AI dependencies")
        return original_import(name, *args, **kwargs)

    async def forbidden_callback(state):
        pytest.fail("No Preliminary result for red flags")

    monkeypatch.setattr(builtins, "__import__", guard_import)
    result = asyncio.run(case.run(on_preliminary=forbidden_callback))

    assert result["is_red_flag"] is True
    assert result["priority_rule"] == result["priority_final"] == "Emergency"
    assert result["ai_status"] == "Skipped"
    assert result["mode"] == "RuleOnly"
    assert result["rule_hits"][0]["version"] == 7
    assert not {"candidates", "llm_output", "validation_result", "error"} & result.keys()
    assert case.events == ["gate"]
    assert not case.client.calls
    assert not case.catalogue_calls
    assert case.state == original


def test_unknown_red_flag_keeps_complete_now_without_emergency(case):
    case.reader._triage_rules = [triage_rule()]
    case.state["input_features"]["vital_signs"] = {}
    result = asyncio.run(case.run())
    assert result["complete_now"] == ["vital_signs.spo2_pct"]
    assert result["is_red_flag"] is False
    assert result["priority_rule"] == result["priority_final"] == "Routine"
    assert result["ai_status"] == "Completed"


@pytest.mark.parametrize("floor", [False, True])
@pytest.mark.parametrize("raise_priority", [False, True])
def test_ai_only_raises_routine_to_high_and_never_lowers_floor(case, floor, raise_priority):
    if floor:
        case.reader._triage_rules = [triage_rule("PRIORITY_FLOOR")]
    case.client.response = output(raise_priority=raise_priority)
    result = asyncio.run(case.run())
    assert result["priority_rule"] == ("HighPriority" if floor else "Routine")
    assert result["priority_final"] == ("HighPriority" if floor or raise_priority else "Routine")
    assert result["ai_status"] == "Completed"


@pytest.mark.parametrize("floor", [False, True])
@pytest.mark.parametrize("failure,code", [
    (LLMConnectionError("SYNTHETIC_PRIVATE_MARKER"), "LLM_ERROR"),
    (LLMConfigurationError("SYNTHETIC_PRIVATE_MARKER"), "LLM_ERROR"),
    (LLMHTTPError(503), "LLM_ERROR"),
    (LLMInvalidJSONError("SYNTHETIC_PRIVATE_MARKER"), "LLM_ERROR"),
    (LLMResponseError("SYNTHETIC_PRIVATE_MARKER"), "LLM_ERROR"),
    (LLMTimeoutError("SYNTHETIC_PRIVATE_MARKER"), "LLM_TIMEOUT"),
    (TimeoutError("SYNTHETIC_PRIVATE_MARKER"), "LLM_TIMEOUT"),
])
def test_llm_failures_validate_baseline_and_return_rule_only(case, floor, failure, code, caplog, capsys):
    if floor:
        case.reader._triage_rules = [triage_rule("PRIORITY_FLOOR")]
    case.client.error = failure
    result = asyncio.run(case.run())
    assert_rule_only(result, code, priority="HighPriority" if floor else "Routine")
    assert len(case.client.calls) == 1
    assert len(case.catalogue_calls) == 2
    assert "SYNTHETIC_PRIVATE_MARKER" not in json.dumps(result["validation_result"])
    captured = capsys.readouterr()
    assert "SYNTHETIC_PRIVATE_MARKER" not in caplog.text + captured.out + captured.err


@pytest.mark.parametrize("attack,code", [
    ("outside", "OUTSIDE_CANDIDATES"),
    ("evidence", "INVALID_SCHEMA"),
    ("emergency", "INVALID_SCHEMA"),
    ("fourth", "OUTSIDE_CANDIDATES"),
    ("malformed", "INVALID_SCHEMA"),
])
def test_validation_failure_discards_entire_proposal_and_keeps_rule_order(case, attack, code):
    proposal = output(raise_priority=True)
    if attack == "outside":
        proposal["ranking"][0]["condition_code"] = "condition_outside"
    elif attack == "evidence":
        proposal["ranking"][0]["supporting_evidence"] = [{"symptom_code": "invented"}]
    elif attack == "emergency":
        proposal["priority_final"] = "Emergency"
    elif attack == "fourth":
        proposal["ranking"][3]["condition_code"] = "condition_outside"
    else:
        proposal = {"ranking": "invalid", "raise_priority": True}
    case.client.response = proposal
    assert_rule_only(asyncio.run(case.run()), code)


@pytest.mark.parametrize("failure", [None, LLMConnectionError("Synthetic failure")])
@pytest.mark.parametrize("catalogue", ["conditions", "symptoms"])
def test_inactive_baseline_is_removed_on_success_and_llm_failure(case, failure, catalogue):
    case.client.error = failure
    if catalogue == "conditions":
        case.active_conditions.remove("condition_d")  # Hidden candidate must also be checked.
    else:
        case.active_symptoms.remove("signal_b")
    result = asyncio.run(case.run())
    assert result["ai_status"] == "Degraded"
    assert result["mode"] == "RuleOnly"
    assert result["candidates"] == []
    assert result["error"] == "INACTIVE_KNOWLEDGE"
    assert result["validation_result"]["errors"] == ["INACTIVE_KNOWLEDGE"]


def test_no_candidates_never_calls_llm_or_catalogue_validators(case):
    case.state["input_features"]["symptoms"] = {}
    result = asyncio.run(case.run())
    assert result["candidates"] == []
    assert result["ai_status"] == "Degraded"
    assert result["mode"] == "RuleOnly"
    assert result["error"] == "NO_CANDIDATES"
    assert "llm_output" not in result
    assert not case.client.calls
    assert not case.catalogue_calls


@pytest.mark.parametrize("failure", [None, LLMTimeoutError("Synthetic timeout")])
def test_preliminary_callback_cannot_mutate_closed_candidates_or_fallback(case, failure):
    case.client.error = failure

    async def mutate_display(display):
        assert len(display["candidates"]) == 3
        display["input_features"]["symptoms"].clear()
        display["candidates"][0]["condition_code"] = "invented"
        display["candidates"][1]["supporting_evidence"].clear()
        display["priority_final"] = "Emergency"

    result = asyncio.run(case.run(on_preliminary=mutate_display))
    if failure:
        assert_rule_only(result, "LLM_TIMEOUT")
    else:
        assert result["ai_status"] == "Completed"
    assert result["priority_final"] == "Routine"
    assert len(case.catalogue_calls[0][1]) == 4


@pytest.mark.parametrize("budget", [0, -1])
def test_exhausted_queue_budget_skips_llm_but_still_returns_validated_rule_only(case, budget):
    result = asyncio.run(case.run(timeout_seconds=budget))
    assert_rule_only(result, "LLM_TIMEOUT")
    assert not case.client.calls
    assert len(case.catalogue_calls) == 2


def test_budget_includes_gate_retrieval_and_preliminary_callback(case, monkeypatch):
    clock = {"now": 100.0}
    monkeypatch.setattr(graph, "monotonic", lambda: clock["now"])
    original_reader = case.reader.active_triage_rules

    def slow_gate():
        clock["now"] += 2
        return original_reader()

    case.reader.active_triage_rules = slow_gate

    async def preliminary(state):
        clock["now"] += 3

    asyncio.run(case.run(timeout_seconds=8, on_preliminary=preliminary))
    assert case.client.calls[0]["timeout_seconds"] == pytest.approx(3)


def test_preliminary_callback_can_exhaust_queue_budget_before_reasoning(case, monkeypatch):
    clock = {"now": 100.0}
    monkeypatch.setattr(graph, "monotonic", lambda: clock["now"])

    async def preliminary(state):
        clock["now"] += 6

    result = asyncio.run(case.run(timeout_seconds=5, on_preliminary=preliminary))
    assert_rule_only(result, "LLM_TIMEOUT")
    assert not case.client.calls


def test_graph_caps_assessment_budget_at_ninety_seconds(case, monkeypatch):
    monkeypatch.setattr(graph, "monotonic", lambda: 100.0)
    asyncio.run(case.run(timeout_seconds=999))
    assert case.client.calls[0]["timeout_seconds"] == 90


def test_graph_enforces_timeout_even_if_client_does_not(case, monkeypatch):
    # Keep import/compilation cost out of this real asyncio timeout check.
    monkeypatch.setattr(graph, "monotonic", lambda: 100.0)
    class HangingClient:
        cancelled = False

        async def generate_json(self, **kwargs):
            try:
                await asyncio.Event().wait()
            finally:
                self.cancelled = True

    case.client = HangingClient()
    result = asyncio.run(case.run(timeout_seconds=0.01))
    assert_rule_only(result, "LLM_TIMEOUT")
    assert case.client.cancelled


@pytest.mark.parametrize("budget", [True, "5", None, float("inf"), float("nan")])
def test_invalid_budget_runs_safety_gate_then_reports_fixed_configuration_error(case, budget):
    with pytest.raises(ValueError, match="^Assessment timeout must be finite seconds.$"):
        asyncio.run(case.run(timeout_seconds=budget))
    assert case.events == ["gate"]


def test_client_receives_only_closed_structured_deidentified_candidates(case):
    asyncio.run(case.run())
    prompt = case.client.calls[0]["prompt"]
    assert "SYNTHETIC_PRIVATE_MARKER" not in prompt
    assert "spo2_pct" not in prompt
    assert "free_text" not in prompt
    assert "patient_name" not in prompt
    for letter in "abcd":
        assert f'"condition_code": "condition_{letter}"' in prompt


def test_reused_input_cannot_keep_stale_llm_results_or_priority(case):
    case.state.update(
        candidates=[{"condition_code": "stale"}], llm_output=output(raise_priority=True),
        priority_final="Emergency", priority_rule="Emergency", is_red_flag=True,
        ai_status="Skipped", error="STALE", validation_result={"valid": True},
    )
    case.client.error = LLMConnectionError("Synthetic failure")
    assert_rule_only(asyncio.run(case.run()), "LLM_ERROR")


def test_worker_cancellation_is_propagated_instead_of_becoming_degraded(case):
    class CancelledClient:
        async def generate_json(self, **kwargs):
            raise asyncio.CancelledError

    case.client = CancelledClient()
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(case.run())
    assert not case.catalogue_calls


def test_preliminary_callback_cancellation_preserves_original_exception(case):
    cancellation = asyncio.CancelledError("Synthetic cancellation")

    async def cancelled(state):
        raise cancellation

    with pytest.raises(asyncio.CancelledError) as caught:
        asyncio.run(case.run(on_preliminary=cancelled))
    assert caught.value is cancellation
    assert not case.client.calls
    assert not case.catalogue_calls


def test_worker_task_cancellation_stops_inflight_llm(case):
    async def cancel_assessment():
        started = asyncio.Event()
        stopped = asyncio.Event()

        class HangingClient:
            async def generate_json(self, **kwargs):
                started.set()
                try:
                    await asyncio.Event().wait()
                finally:
                    stopped.set()

        case.client = HangingClient()
        task = asyncio.create_task(case.run())
        try:
            await asyncio.wait_for(started.wait(), timeout=5)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert task.cancelled()
            assert stopped.is_set()
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(cancel_assessment())
    assert not case.catalogue_calls


def test_unexpected_programming_failure_is_not_swallowed(case):
    case.client.error = RuntimeError("Synthetic programming failure")
    with pytest.raises(RuntimeError, match="Synthetic programming failure"):
        asyncio.run(case.run())
    assert not case.catalogue_calls


def test_catalogue_infrastructure_failure_propagates_to_worker(case, monkeypatch):
    def unavailable(db, codes):
        raise RuntimeError("Synthetic DB unavailable")

    monkeypatch.setattr(knowledge_validators, "active_condition_codes", unavailable)
    with pytest.raises(RuntimeError, match="Synthetic DB unavailable"):
        asyncio.run(case.run())


def test_preliminary_persistence_failure_stops_before_llm(case):
    async def unavailable(state):
        raise RuntimeError("Synthetic transaction failure")

    with pytest.raises(RuntimeError, match="Synthetic transaction failure"):
        asyncio.run(case.run(on_preliminary=unavailable))
    assert not case.client.calls


def test_langgraph_has_no_checkpointer_debug_or_callbacks_and_tracing_is_disabled(case, monkeypatch):
    # This spies on the real engine; no fake graph is used to claim orchestration passes.
    from langgraph.graph import StateGraph
    import langsmith

    compile_graph = StateGraph.compile
    tracing_context = langsmith.tracing_context
    seen = {}

    def compile_spy(self, **kwargs):
        seen["compile"] = kwargs
        compiled = compile_graph(self, **kwargs)
        invoke = compiled.ainvoke

        async def invoke_spy(state, *, config):
            seen["config"] = config
            return await invoke(state, config=config)

        # Proxy just the call; execution still uses the compiled real graph.
        class Invocation:
            ainvoke = staticmethod(invoke_spy)

        return Invocation()

    def tracing_spy(**kwargs):
        seen["tracing"] = kwargs
        return tracing_context(**kwargs)

    monkeypatch.setattr(StateGraph, "compile", compile_spy)
    monkeypatch.setattr(langsmith, "tracing_context", tracing_spy)
    result = asyncio.run(case.run())
    assert result["ai_status"] == "Completed"
    assert seen == {
        "compile": {"checkpointer": False, "debug": False},
        "config": {"callbacks": []},
        "tracing": {"enabled": False},
    }
