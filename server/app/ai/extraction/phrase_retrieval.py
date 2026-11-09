"""Chuẩn bị ứng viên từng cụm; chưa nối đường extraction mặc định trong worker."""

from collections.abc import Sequence
from dataclasses import dataclass, field
import math
from time import monotonic

from app.ai.extraction.candidate_index import CandidateIndexCache, Candidate
from app.ai.extraction.feature_extractor import _redact_identifiers
from app.ai.extraction.phrase_splitter import Phrase, split_phrases
from app.ai.interfaces import KnowledgeReader


class RetrievalDeadlineExceeded(TimeoutError):
    """Hết ngân sách toàn lượt; không trả danh sách ứng viên thiếu phần đuôi."""


@dataclass(frozen=True)
class PhraseCandidates:
    phrase: Phrase
    candidates: tuple[Candidate, ...]


@dataclass(frozen=True)
class RetrievalPlan:
    snapshot_key: str
    catalogue_sha256: str
    masked_text: str = field(repr=False)
    groups: tuple[PhraseCandidates, ...] = field(repr=False)


def retrieve_phrases(
    text: str, reader: KnowledgeReader, cache: CandidateIndexCache, *,
    identifiers: Sequence[str], per_phrase_limit: int, deadline: float,
) -> RetrievalPlan:
    """Caller chạy Node 1 trước, truyền deadline từ queued_at; không cấp lại 30 s.

    Chỉ là bước truy xuất, không trả SymptomSuggestion hoặc suy ra PRESENT/ABSENT.
    Lời kể/context đã che PII; chỉ mục không giữ chúng sau khi trả kết quả.
    """
    if isinstance(deadline, bool) or not isinstance(deadline, (float, int)) or not math.isfinite(deadline):
        raise ValueError("Invalid retrieval deadline.")
    if type(per_phrase_limit) is not int or per_phrase_limit <= 0:
        raise ValueError("Invalid per-phrase candidate limit.")

    def check_deadline():
        if monotonic() >= deadline:
            raise RetrievalDeadlineExceeded("Extraction retrieval budget exhausted.")

    check_deadline()
    masked = _redact_identifiers(text, identifiers)
    phrases = split_phrases(masked)
    check_deadline()
    index = cache.get(reader)
    check_deadline()
    groups = []
    for phrase in phrases:
        check_deadline()
        groups.append(PhraseCandidates(phrase, index.search(phrase.text, limit=per_phrase_limit)))
    check_deadline()
    return RetrievalPlan(index.snapshot_key, index.catalogue_sha256, masked, tuple(groups))
