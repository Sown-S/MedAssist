"""Điều phối Node 1-4 trong worker bằng LangGraph; tắt tracing và checkpointer.

Envelope thay toàn bộ ``PipelineState`` để không sót ``llm_output`` thô khi node xóa khóa.
"""

import asyncio
from collections.abc import Awaitable, Callable
from copy import deepcopy
import math
from time import monotonic
from typing import Any, NotRequired, TypedDict

from sqlalchemy.orm import Session

from app.ai.interfaces import KnowledgeReader, LLMClient
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.pipeline.state import PipelineState

PreliminaryCallback = Callable[[PipelineState], Awaitable[None]]
ASSESSMENT_TIMEOUT_SECONDS = 90


class _GraphState(TypedDict):
    assessment: PipelineState
    preliminary: NotRequired[PipelineState]
    llm_failure: NotRequired[str]


async def run_pipeline(
    state: PipelineState,
    knowledge_reader: KnowledgeReader,
    llm_client: LLMClient,
    db: Session,
    *,
    timeout_seconds: float,
    on_preliminary: PreliminaryCallback | None = None,
) -> PipelineState:
    """Chạy Node 1-4 trong ngân sách thời gian còn lại; lỗi LLM/timeout suy giảm về ``RuleOnly``."""
    started = monotonic()
    gated = run_node1(deepcopy(state), knowledge_reader)
    if gated["is_red_flag"]:
        gated["mode"] = "RuleOnly"
        return gated

    if (
        isinstance(timeout_seconds, bool)
        or not isinstance(timeout_seconds, (int, float))
        or not math.isfinite(timeout_seconds)
    ):
        raise ValueError("Assessment timeout must be finite seconds.")
    deadline = started + min(timeout_seconds, ASSESSMENT_TIMEOUT_SECONDS)

    # LangGraph/LangSmith chỉ là phụ thuộc chạy cục bộ. Tắt rõ tracing từ môi
    # trường, callback kế thừa và debug vì state graph/payload lỗi có thể chứa dữ
    # liệu lâm sàng.
    from langsmith import tracing_context

    with tracing_context(enabled=False):
        from langgraph.errors import NodeCancelledError

        graph = _compile_worker_graph(
            knowledge_reader, llm_client, db, deadline, on_preliminary
        )
        try:
            result = await graph.ainvoke({"assessment": gated}, config={"callbacks": []})
        except NodeCancelledError as exc:
            # LangGraph bọc cancellation phát sinh trong thân node. Khôi phục hợp
            # đồng cancellation của worker, không coi đây là lỗi LLM.
            if isinstance(exc.__cause__, asyncio.CancelledError):
                raise exc.__cause__ from None
            raise asyncio.CancelledError from None
    return result["assessment"]


def _compile_worker_graph(
    knowledge_reader: KnowledgeReader,
    llm_client: LLMClient,
    db: Session,
    deadline: float,
    on_preliminary: PreliminaryCallback | None,
) -> Any:
    from langgraph.graph import END, START, StateGraph

    from app.ai.llm.client import LLMError, LLMTimeoutError
    from app.ai.pipeline.node2_graph_retrieval import run_node2
    from app.ai.pipeline.node3_reasoning import run_node3
    from app.ai.pipeline.node4_output_validation import MAX_DISPLAY_CANDIDATES, run_node4

    # Wrapper async giữ tác vụ reader/session đồng bộ trên thread gọi của worker,
    # không đẩy sang executor mà LangGraph dùng cho node đồng bộ.
    async def retrieve(envelope: _GraphState) -> _GraphState:
        retrieved = run_node2(envelope["assessment"], knowledge_reader)
        retrieved.update(ai_status="Preliminary", mode="RuleOnly")
        preliminary = deepcopy(retrieved)
        if on_preliminary is not None:
            display = deepcopy(preliminary)
            display["candidates"] = display["candidates"][:MAX_DISPLAY_CANDIDATES]
            await on_preliminary(display)
        return {"assessment": retrieved, "preliminary": preliminary}

    async def reason(envelope: _GraphState) -> dict[str, Any]:
        preliminary = envelope["preliminary"]
        if not preliminary["candidates"]:
            return {"assessment": deepcopy(preliminary)}
        remaining = deadline - monotonic()
        if remaining <= 0:
            return {"assessment": deepcopy(preliminary), "llm_failure": "LLM_TIMEOUT"}
        try:
            async with asyncio.timeout(remaining):
                reasoning = await run_node3(
                    deepcopy(preliminary), llm_client, timeout_seconds=remaining
                )
        except (LLMTimeoutError, TimeoutError):
            return {"assessment": deepcopy(preliminary), "llm_failure": "LLM_TIMEOUT"}
        except LLMError:
            return {"assessment": deepcopy(preliminary), "llm_failure": "LLM_ERROR"}
        return {"assessment": reasoning}

    async def validate(envelope: _GraphState) -> dict[str, PipelineState]:
        failure = envelope.get("llm_failure")
        baseline = envelope["preliminary"] if failure else envelope["assessment"]
        validated = run_node4(deepcopy(baseline), db)
        # Khi LLM lỗi thì chủ động không có proposal. Giữ nguyên lỗi baseline mạnh
        # hơn (mã inactive, bằng chứng sai hoặc không có ứng viên).
        if failure and validated.get("error") == "INVALID_SCHEMA":
            validated["error"] = failure
            validated["validation_result"]["errors"] = [failure]
        return {"assessment": validated}

    builder = StateGraph(_GraphState)
    builder.add_node("node2_retrieval", retrieve)
    builder.add_node("node3_reasoning", reason)
    builder.add_node("node4_validation", validate)
    builder.add_edge(START, "node2_retrieval")
    builder.add_edge("node2_retrieval", "node3_reasoning")
    builder.add_edge("node3_reasoning", "node4_validation")
    builder.add_edge("node4_validation", END)
    return builder.compile(checkpointer=False, debug=False)
