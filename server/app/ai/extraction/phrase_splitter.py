"""Tách cụm bằng code, giữ nguyên span/ngữ cảnh; không gán trạng thái lâm sàng."""

from dataclasses import dataclass, field
import re

SPLITTER_VERSION = "phrase-spans-v1"
# Giữ dấu thập phân trong cả hai cách viết 38.5 và 38,5.
_SENTENCE = re.compile(r"[;!?\r\n]+|(?<!\d)\.|\.(?!\d)")
_CLAUSE = re.compile(r"(?<!\d),|,(?!\d)|\b(?:và|va|nhưng|nhung|kèm|kem)\b", re.IGNORECASE)
_WORDS = re.compile(r"\w+", re.UNICODE)


class IncompleteSegmentation(ValueError):
    """Vượt giới hạn bảo vệ CPU/kích thước; không trả một phần lời kể."""


@dataclass(frozen=True)
class Phrase:
    phrase_id: str
    start: int
    end: int
    context_start: int
    context_end: int
    text: str = field(repr=False)
    context: str = field(repr=False)


def _trim(text: str, start: int, end: int) -> tuple[int, int]:
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    return start, end


def split_phrases(
    masked_text: str, *, max_chars: int = 12000, max_phrases: int = 64,
    window_words: int = 24, overlap_words: int = 6,
) -> tuple[Phrase, ...]:
    """Nhận lời kể đã che PII; mỗi từ phải còn trong ít nhất một span.

    Ranh giới mềm giữ toàn câu làm context, nên ``không ho và khó thở`` không
    đánh mất phạm vi phủ định. Câu dài dùng cửa sổ chồng lấn; các giới hạn trên
    chỉ bảo vệ tài nguyên, KHÔNG phải ước lượng token hoặc cam kết vừa context.
    """
    if not isinstance(masked_text, str):
        raise ValueError("Invalid masked text.")
    if any(type(value) is not int or value <= 0 for value in (max_chars, max_phrases, window_words)):
        raise ValueError("Invalid segmentation limits.")
    if type(overlap_words) is not int or not 0 <= overlap_words < window_words:
        raise ValueError("Invalid segmentation overlap.")
    if len(masked_text) > max_chars:
        raise IncompleteSegmentation("Extraction text exceeds segmentation budget.")
    phrases = []
    sentence_start = 0
    sentence_ends = [(match.start(), match.end()) for match in _SENTENCE.finditer(masked_text)]
    sentence_ends.append((len(masked_text), len(masked_text)))
    for sentence_end, next_start in sentence_ends:
        context_start, context_end = _trim(masked_text, sentence_start, sentence_end)
        sentence_start = next_start
        if context_start == context_end:
            continue
        # Đưa dấu nối vào span kế tiếp, không bỏ các từ "và", "nhưng" khỏi input.
        boundaries = [context_start] + [
            match.start() for match in _CLAUSE.finditer(masked_text, context_start, context_end)
            if match.start() > context_start
        ] + [context_end]
        for start, end in zip(boundaries, boundaries[1:]):
            start, end = _trim(masked_text, start, end)
            words = list(_WORDS.finditer(masked_text, start, end))
            if not words:
                continue
            cursor = 0
            while cursor < len(words):
                stop = min(cursor + window_words, len(words))
                span_start = start if cursor == 0 else words[cursor].start()
                span_end = end if stop == len(words) else words[stop - 1].end()
                phrases.append(Phrase(
                    phrase_id=f"p{len(phrases) + 1}", start=span_start, end=span_end,
                    context_start=context_start, context_end=context_end,
                    text=masked_text[span_start:span_end],
                    context=masked_text[context_start:context_end],
                ))
                if len(phrases) > max_phrases:
                    raise IncompleteSegmentation("Extraction phrase count exceeds budget.")
                if stop == len(words):
                    break
                cursor = stop - overlap_words
    return tuple(phrases)
