"""Worker-side reasoning over Node 2's closed candidate list.

Only structured candidate codes, scores and evidence enter the prompt. Raw
input features, identifiers and arbitrary metadata are never forwarded. The
returned JSON stays in ``llm_output`` for Node 4; it must not be displayed or
used to change priority here. No prompts or patient data are logged/persisted.
"""

import json
from typing import Any

from app.ai.interfaces import LLMClient
from app.ai.llm.client import LLMConfigurationError
from app.ai.llm.output_schemas import reasoning_json_schema
from app.ai.llm.prompts import REASONING_PROMPT_VERSION, load_prompt
from app.ai.pipeline.node2_graph_retrieval import MAX_CANDIDATES
from app.ai.pipeline.state import PipelineState

_EVIDENCE_FIELDS = ("symptom_code", "status", "polarity", "weight", "is_key")


async def run_node3(
    state: PipelineState,
    llm_client: LLMClient,
    *,
    timeout_seconds: float,
) -> PipelineState:
    """Request ranking/reasons and an optional Routine -> HighPriority proposal.

    The worker supplies the *remaining* assessment budget measured from queueing,
    rather than restarting the 90-second deadline. Client errors and worker
    cancellation propagate to the graph's Rule-only fallback/cancellation path.
    Node 4 owns schema, Active codes, evidence and safety-floor validation.
    """
    result = state.copy()
    for key in ("llm_output", "validation_result", "error"):
        result.pop(key, None)
    if (
        state.get("is_red_flag") is True
        or state.get("ai_status") == "Skipped"
        or state.get("priority_rule") == "Emergency"
        or state.get("priority_final") == "Emergency"
    ):
        result.pop("candidates", None)
        return result
    if (
        state.get("is_red_flag") is not False
        or state.get("priority_rule") not in ("Routine", "HighPriority")
        or state.get("priority_final") not in ("Routine", "HighPriority")
    ):
        raise ValueError("Phải chạy Node 1 trước Node 3")
    candidates = state.get("candidates")
    if not isinstance(candidates, list) or len(candidates) > MAX_CANDIDATES:
        raise ValueError("Phải chạy Node 2 trước Node 3 (tối đa 4 ứng viên)")
    if not candidates:
        return result

    prompt = _reasoning_prompt(state, candidates)
    result["llm_output"] = await llm_client.generate_json(
        prompt=prompt,
        schema=reasoning_json_schema(),
        timeout_seconds=timeout_seconds,
    )
    return result


def _reasoning_prompt(state: PipelineState, candidates: list[dict[str, Any]]) -> str:
    # Node 2 supplies normalized, confirmed catalogue codes. Project each nested
    # evidence row as well as each candidate so extra free text cannot leak in.
    try:
        data = {
            "priority_rule": state["priority_rule"],
            "priority_final": state["priority_final"],
            "candidates": [
                {
                    "condition_code": candidate["condition_code"],
                    "score": candidate["score"],
                    "coverage": candidate["coverage"],
                    "precision": candidate["precision"],
                    "supporting_evidence": [
                        {key: row[key] for key in _EVIDENCE_FIELDS}
                        for row in candidate["supporting_evidence"]
                    ],
                    "contradicting_evidence": [
                        {key: row[key] for key in _EVIDENCE_FIELDS}
                        for row in candidate["contradicting_evidence"]
                    ],
                    "unknown_key_symptoms": candidate["unknown_key_symptoms"],
                }
                for candidate in candidates
            ],
        }
        payload = json.dumps(data, ensure_ascii=False, allow_nan=False)
    except (KeyError, TypeError, ValueError, RecursionError):
        # Do not include failing values/parser context, which might contain PHI.
        raise LLMConfigurationError("Invalid Node 2 reasoning input.") from None
    return load_prompt(REASONING_PROMPT_VERSION) + "\n" + payload
