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
_STOP = frozenset("va hoac nhung kem co khong chua ro bi la thi cua voi khi luc da dang "
                  "duoc mot cac nhieu rat ngay hom nay toi benh nhan redacted".split())


def _tokens(value: str) -> tuple[str, ...]:
    return tuple(re.findall(r"[^\W_]+", _normalise(value).casefold()))


def _features(value: str) -> frozenset[str]:
    words = _tokens(value)
    folded = tuple(_strip_accents(word) for word in words)
    result = set()
    for word, plain in zip(words, folded):
        if plain in _STOP or len(plain) < 2 or plain.isdigit():
            continue
        result.add("a:" + word)
        result.add("f:" + plain)
    for first, second in zip(folded, folded[1:]):
        if first not in _STOP and second not in _STOP and not first.isdigit() and not second.isdigit():
            result.add("b:" + first + " " + second)
    return frozenset(result)


def _grams(value: str) -> frozenset[str]:
    # N-gram trong từng từ: hỗ trợ gõ sai nhẹ, không nhận là đồng nghĩa.
    words = {_strip_accents(word) for word in _tokens(value)} - _STOP
    return frozenset(word[i:i + 3] for word in words if not word.isdigit()
                     for i in range(max(0, len(word) - 2)))


def _feature_weight(feature: str) -> float:
    return 1.5 if feature.startswith("b:") else (1.0 if feature.startswith("a:") else 0.65)


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
        features, grams = _features(phrase), _grams(phrase)
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
