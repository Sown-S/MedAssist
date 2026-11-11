"""Chỉ mục từ vựng trong bộ nhớ từ KnowledgeReader Active, không LLM/embedding.

Điểm chỉ xếp hạng truy xuất, không phải confidence, trạng thái hoặc chẩn đoán.
Không tự tạo alias. Các kết quả phải được Gemma chọn và validation/HITL sau đó.
"""

from collections import OrderedDict, defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from hashlib import sha256
import json
import math
import re
from threading import Lock
from types import MappingProxyType

from app.ai.extraction.feature_extractor import _catalogue, _normalise, _strip_accents
from app.ai.interfaces import KnowledgeReader

INDEX_VERSION = "lexical-phrases-v1"
# Chỉ bỏ từ chức năng ở truy vấn, không đổi lời kể/context gửi bước chọn mã.
# Tách bản có dấu để không xóa nhầm từ y khoa ('da', 'cơ', 'cổ', 'bí', 'khí', 'rát', 'thị', 'lực').
_STOP_ACCENTED = frozenset(
    "và hoặc nhưng kèm có không chưa rõ bị là thì của với khi lúc đã đang "
    "được một các nhiều rất ngày hôm nay tôi bệnh nhân redacted".split()
)
_STOP = frozenset(
    "va hoac nhung khong chua la cua duoc mot cac nhieu hom nay toi benh nhan redacted".split()
)


def _tokens(value: str) -> tuple[str, ...]:
    return tuple(re.findall(r"[^\W_]+", _normalise(value).casefold()))


def _is_stop(word: str, plain: str, *, unaccented_text: bool) -> bool:
    return (plain in _STOP) if unaccented_text else (word in _STOP_ACCENTED)


def _features(value: str, *, is_query: bool = False) -> frozenset[str]:
    words = _tokens(value)
    folded = tuple(_strip_accents(word) for word in words)
    unaccented_text = all(word == plain for word, plain in zip(words, folded))
    result = set()
    for word, plain in zip(words, folded):
        if _is_stop(word, plain, unaccented_text=unaccented_text) or len(plain) < 2 or plain.isdigit():
            continue
        result.add("a:" + word)
        if not is_query or unaccented_text:
            result.add("f:" + plain)
    for (w1, p1), (w2, p2) in zip(zip(words, folded), zip(words[1:], folded[1:])):
        if (
            not _is_stop(w1, p1, unaccented_text=unaccented_text)
            and not _is_stop(w2, p2, unaccented_text=unaccented_text)
            and not p1.isdigit()
            and not p2.isdigit()
        ):
            result.add("ab:" + w1 + " " + w2)
            if not is_query or unaccented_text:
                result.add("b:" + p1 + " " + p2)
    return frozenset(result)


def _grams(value: str, *, is_query: bool = False) -> frozenset[str]:
    # N-gram trong từng từ: hỗ trợ gõ sai nhẹ, không làm trùng cặp tối thiểu có dấu (nấm/nám).
    words = _tokens(value)
    folded = tuple(_strip_accents(word) for word in words)
    unaccented_text = all(word == plain for word, plain in zip(words, folded))
    tokens = set()
    for word, plain in zip(words, folded):
        if _is_stop(word, plain, unaccented_text=unaccented_text) or plain.isdigit():
            continue
        tokens.add("a:" + word)
        if not is_query or unaccented_text:
            tokens.add("f:" + plain)
    return frozenset(
        prefix + token[i : i + 3]
        for item in tokens
        for prefix, token in ((item[:2], item[2:]),)
        for i in range(max(0, len(token) - 2))
    )


def _feature_weight(feature: str) -> float:
    if feature.startswith("ab:"):
        return 1.65
    if feature.startswith("b:"):
        return 1.5
    if feature.startswith("a:"):
        return 1.0
    return 0.65


@dataclass(frozen=True)
class Candidate:
    symptom_code: str
    symptom_name: str
    score: float
    match_sources: tuple[str, ...]


@dataclass(frozen=True)
class _Document:
    code: str
    name: str
    features: frozenset[str]
    grams: frozenset[str]


@dataclass(frozen=True)
class CandidateIndex:
    snapshot_key: str
    catalogue_sha256: str
    documents: tuple[_Document, ...]
    postings: Mapping[str, tuple[int, ...]]
    gram_postings: Mapping[str, tuple[int, ...]]
    idf: Mapping[str, float]

    def search(self, phrase: str, *, limit: int) -> tuple[Candidate, ...]:
        """Tìm trong toàn chỉ mục; caller chọn K bằng số đo, không có K production mặc định."""
        if not isinstance(phrase, str) or type(limit) is not int or limit <= 0:
            raise ValueError("Invalid candidate query or limit.")
        features, grams = _features(phrase, is_query=True), _grams(phrase, is_query=True)
        lexical = defaultdict(float)
        for feature in sorted(features):
            for doc_id in self.postings.get(feature, ()):
                lexical[doc_id] += self.idf[feature] * _feature_weight(feature)
        gram_hits = defaultdict(int)
        for gram in sorted(grams):
            for doc_id in self.gram_postings.get(gram, ()):
                gram_hits[doc_id] += 1
        query_weight = sum(self.idf.get(feature, 0) * _feature_weight(feature) for feature in sorted(features))
        result = []
        for doc_id in sorted(lexical.keys() | gram_hits.keys()):
            doc = self.documents[doc_id]
            lexical_score = lexical[doc_id] / max(1.0, query_weight)
            # Giảm ưu thế của tên hội chứng ghép dài chỉ trùng vài từ phổ biến.
            lexical_score /= math.sqrt(max(1.0, len(doc.features) / max(1, len(features))))
            gram_score = 2 * gram_hits[doc_id] / max(1, len(grams) + len(doc.grams))
            if not lexical_score and gram_score < 0.15:
                continue
            sources = tuple(name for name, active in (
                ("lexical", lexical_score > 0), ("character_ngram", gram_score > 0),
            ) if active)
            result.append(Candidate(doc.code, doc.name, lexical_score + 0.35 * gram_score, sources))
        result.sort(key=lambda candidate: (-candidate.score, candidate.symptom_code))
        return tuple(result[:limit])


def _read_catalogue(reader: KnowledgeReader):
    release = dict(reader.active_release())
    rows = _catalogue(reader)  # Dùng validator SymptomCode chung đã có.
    if dict(reader.active_release()) != release:
        raise ValueError("Knowledge snapshot changed while building candidate index.")
    catalogue_hash = sha256(json.dumps(rows, ensure_ascii=True, sort_keys=True).encode()).hexdigest()
    # Có fingerprint để cả reader thiếu epoch hoặc sửa tên cùng metadata cũng không hit cache cũ.
    key = sha256(json.dumps({
        "version": INDEX_VERSION, "release_id": release.get("release_id"),
        "epoch": release.get("epoch"), "catalogue": catalogue_hash,
    }, sort_keys=True, default=str).encode()).hexdigest()
    return key, catalogue_hash, rows


def _build(key: str, catalogue_hash: str, rows: list[dict[str, str]]) -> CandidateIndex:
    documents = []
    postings, gram_postings = defaultdict(list), defaultdict(list)
    for row in rows:
        doc_id = len(documents)
        name, code = row["symptom_name"], row["symptom_code"]
        features = _features(name) | _features(code.replace("_", " "))
        grams = _grams(name)
        documents.append(_Document(code, name, features, grams))
        for feature in sorted(features):
            postings[feature].append(doc_id)
        for gram in sorted(grams):
            gram_postings[gram].append(doc_id)
    return CandidateIndex(
        key, catalogue_hash, tuple(documents),
        MappingProxyType({feature: tuple(ids) for feature, ids in postings.items()}),
        MappingProxyType({gram: tuple(ids) for gram, ids in gram_postings.items()}),
        MappingProxyType({feature: math.log(1 + len(documents) / len(ids)) for feature, ids in postings.items()}),
    )


class CandidateIndexCache:
    """Cache LRU chỉ chứa tri thức; job giữ index bất biến kể cả khi cache thay release.

    Caller truyền SnapshotReader đã ghim cho job. Có đọc/băm catalog để kiểm định
    cache, nhưng chỉ dựng postings khi khóa mới; không cache lời kể hoặc truy vấn.
    """

    def __init__(self, max_entries: int = 2):
        if type(max_entries) is not int or max_entries <= 0:
            raise ValueError("Invalid candidate cache size.")
        self._max_entries = max_entries
        self._indexes: OrderedDict[str, CandidateIndex] = OrderedDict()
        self._lock = Lock()

    def get(self, reader: KnowledgeReader) -> CandidateIndex:
        key, catalogue_hash, rows = _read_catalogue(reader)
        with self._lock:
            cached = self._indexes.get(key)
            if cached is not None:
                self._indexes.move_to_end(key)
                return cached
        built = _build(key, catalogue_hash, rows)
        with self._lock:
            # Thread khác có thể đã dựng cùng khóa; trả một đối tượng chung.
            index = self._indexes.setdefault(key, built)
            self._indexes.move_to_end(key)
            while len(self._indexes) > self._max_entries:
                self._indexes.popitem(last=False)
            return index
