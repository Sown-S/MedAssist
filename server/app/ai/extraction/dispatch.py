"""Điểm chọn extractor dùng chung cho worker và công cụ đo, không đọc settings."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy.orm import Session

from app.ai.extraction import feature_extractor, phrase_selector
from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.interfaces import KnowledgeReader, LLMClient
from app.ai.pipeline.state import PipelineState


@dataclass(frozen=True)
class ExtractionOptions:
    strategy: Literal["legacy", "phrases"] = "phrases"
    per_phrase_limit: int = 4

    def __post_init__(self):
        if self.strategy not in ("legacy", "phrases"):
            raise ValueError("Unknown extraction strategy.")
        if type(self.per_phrase_limit) is not int or self.per_phrase_limit <= 0:
            raise ValueError("Invalid per-phrase candidate limit.")


@dataclass(frozen=True)
class ExtractionResult:
    strategy: str
    prompt_version: str
    # Legacy chỉ trả list: [] không phân biệt không triệu chứng/lỗi/timeout.
    # None thể hiện chưa biết, không được tính là hoàn tất kỹ thuật khi đo.
    completed: bool | None
    failure_code: str | None = None
    suggestions: tuple[feature_extractor.SymptomSuggestion, ...] = field(default=(), repr=False)


async def run_extraction(
    text: str, knowledge_reader: KnowledgeReader, llm_client: LLMClient, db: Session, *,
    gate_state: PipelineState, identifiers: Sequence[str], timeout_seconds: float,
    options: ExtractionOptions = ExtractionOptions(), cache: CandidateIndexCache | None = None,
) -> ExtractionResult:
    """Caller chạy Node 1, ghim reader và truyền ngân sách còn lại; không retry/fallback.

    Không quản lý transaction/queue hoặc tự tạo model. CLI phải lấy metadata từ
    kết quả này, không dùng hằng phiên bản của extractor legacy cho mọi strategy.
    """
    if options.strategy == "phrases":
        result = await phrase_selector.select_phrase_symptoms(
            text, knowledge_reader, llm_client, db, gate_state=gate_state,
            identifiers=identifiers, timeout_seconds=timeout_seconds,
            cache=cache if cache is not None else CandidateIndexCache(),
            per_phrase_limit=options.per_phrase_limit,
        )
        return ExtractionResult(options.strategy, result.prompt_version, result.completed,
                                result.failure_code, result.suggestions)
    suggestions = await feature_extractor.extract_symptoms(
        text, knowledge_reader, llm_client, db, gate_state=gate_state,
        identifiers=identifiers, timeout_seconds=timeout_seconds,
    )
    return ExtractionResult(
        options.strategy, feature_extractor.EXTRACTION_PROMPT_VERSION,
        True if suggestions else None,
        None if suggestions else "LEGACY_EMPTY_UNCLASSIFIED", tuple(suggestions),
    )
