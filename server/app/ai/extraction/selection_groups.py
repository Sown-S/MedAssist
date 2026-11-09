"""Giữ liên từ phối hợp trong một nhóm chọn mã, không suy trạng thái/alias."""

from dataclasses import replace
import re

from app.ai.extraction.phrase_retrieval import PhraseCandidates, RetrievalPlan

SELECTION_GROUPS_VERSION = "shared-negation-pair-v3"
_COORDINATION = re.compile(r"^(?:và|va)\b", re.IGNORECASE)
_NEGATED_START = re.compile(r"^(?:không|khong)\b", re.IGNORECASE)
_OWN_SCOPE = re.compile(r"^(?:và|va)\s+(?:không|khong|chưa|chua|có|co|đã|da|đang|dang)\b", re.IGNORECASE)


def group_for_selection(
    plan: RetrievalPlan, *, shared_negation_only: bool = True, pair_only: bool = True,
) -> RetrievalPlan:
    """Truy xuất vẫn theo span nhỏ; chỉ hợp nhóm đọc và toàn bộ ứng viên cho LLM.

    Mặc định chỉ giữ phủ định đầu cụm với một vế và chưa có dấu phạm vi riêng.
    Chuỗi từ ba vế giữ nguyên từng nhóm; hợp quá nhiều mã dễ gây chọn thừa.
    Đây là lựa chọn ranh giới đọc, không gán/đổi trạng thái do LLM trả.
    shared_negation_only=False dành cho đối chứng cách ghép rộng đã thử.
    Không ghép qua câu, dấu phẩy, nhưng/kèm hay cửa sổ chồng lấn. Giữ nguyên
    văn bản đã che PII, không thêm từ phủ định hoặc tự gán trạng thái.
    """
    groups = []
    for index, group in enumerate(plan.groups):
        current = group.phrase
        previous = groups[-1].phrase if groups else None
        following = plan.groups[index + 1].phrase if index + 1 < len(plan.groups) else None
        continues = (following is not None and _COORDINATION.match(following.text)
                     and current.context_start == following.context_start
                     and current.context_end == following.context_end
                     and current.end <= following.start
                     and not plan.masked_text[current.end:following.start].strip())
        if (previous is not None and _COORDINATION.match(current.text)
                and (not shared_negation_only or (
                    _NEGATED_START.match(previous.text) and not _OWN_SCOPE.match(current.text)
                    and (not pair_only or not continues)))
                and previous.context_start == current.context_start
                and previous.context_end == current.context_end
                and previous.end <= current.start
                and not plan.masked_text[previous.end:current.start].strip()):
            # Không cắt lại về K: mã của từng cụm nhỏ phải còn trong hợp.
            candidates = {item.symptom_code: item for item in groups[-1].candidates}
            for item in group.candidates:
                candidates.setdefault(item.symptom_code, item)
            phrase = replace(previous, end=current.end,
                             text=plan.masked_text[previous.start:current.end])
            groups[-1] = PhraseCandidates(phrase, tuple(candidates.values()))
        else:
            groups.append(group)
    return replace(plan, groups=tuple(
        replace(group, phrase=replace(group.phrase, phrase_id=f"p{index}"))
        for index, group in enumerate(groups, 1)
    ))
