"""Đề xuất FR14 tất định từ các ứng viên dẫn đầu của Node 2.

Sử dụng ``unknown_key_symptoms`` của Node 2 và catalog triệu chứng Active từ cùng
snapshot đánh giá. Chỉ ba ứng viên đầu đóng góp theo thứ tự xếp hạng được truyền.
Trong mỗi ứng viên, sắp mã và bỏ mã trùng đã được ứng viên hạng cao hơn đề xuất.

Triệu chứng đã xác nhận nhưng bị bỏ qua được hiểu là UNKNOWN như Node 2. Kiểm tra
lại trạng thái để không hỏi lại triệu chứng sau đó đã thành PRESENT/ABSENT. Văn bản
tự do, trích xuất chưa xác nhận, sinh hiệu và tuổi không đóng góp vào đề xuất FR14.
Helper này trả mã triệu chứng nội bộ, không trả chẩn đoán hay payload hiển thị; lớp
đầu ra thêm nhãn "Reference Suggestion". Hàm không gọi LLM, truy vấn tri thức, log,
ghi dữ liệu hoặc đổi ưu tiên.
"""

from collections.abc import Mapping, Sequence

from app.ai.interfaces import JsonObject

MAX_RELEVANT_CANDIDATES = 3


class MissingInformationFormatError(ValueError):
    """Đặc trưng đã xác nhận hoặc snapshot Node 2/reader có hình dạng không hợp lệ."""


def find_missing_information(
    input_features: JsonObject,
    candidates: Sequence[JsonObject],
    symptoms: Sequence[JsonObject],
) -> list[str]:
    """Liệt kê triệu chứng key UNKNOWN không trùng, liên quan ứng viên dẫn đầu.

    ``candidates`` phải là danh sách đóng đã xếp hạng do Node 2 tạo sau cổng Node
    1; truyền danh sách rỗng cho trạng thái cờ đỏ kết thúc. ``symptoms`` phải đến
    từ ``KnowledgeReader.active_symptoms()``. Phép giao catalog giới hạn đề xuất
    tại đây; kiểm tra Active/mã dùng chung ở biên ứng dụng vẫn nằm trong
    ``validation.knowledge_validators``.
    """
    if not isinstance(input_features, Mapping):
        raise MissingInformationFormatError("input_features phải là object")
    observed = input_features.get("symptoms", {})
    if not isinstance(observed, Mapping):
        raise MissingInformationFormatError("input_features.symptoms phải là object")
    for status in observed.values():
        if not isinstance(status, str) or status not in ("PRESENT", "ABSENT", "UNKNOWN"):
            raise MissingInformationFormatError("Trạng thái triệu chứng không hợp lệ")

    catalogue = {
        _code(symptom.get("symptom_code"))
        for symptom in _objects(symptoms, "symptoms")
    }
    missing: list[str] = []
    seen: set[str] = set()
    for candidate in _objects(candidates, "candidates")[:MAX_RELEVANT_CANDIDATES]:
        codes = candidate.get("unknown_key_symptoms", ())
        if not isinstance(codes, Sequence) or isinstance(codes, (str, bytes, bytearray)):
            raise MissingInformationFormatError("unknown_key_symptoms phải là danh sách mã")
        for code in sorted({_code(value) for value in codes}):
            if code in catalogue and observed.get(code, "UNKNOWN") == "UNKNOWN" and code not in seen:
                missing.append(code)
                seen.add(code)
    return missing


def _objects(value: object, label: str) -> Sequence[JsonObject]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise MissingInformationFormatError(f"{label} phải là danh sách object")
    if any(not isinstance(item, Mapping) for item in value):
        raise MissingInformationFormatError(f"{label} phải là danh sách object")
    return value


def _code(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise MissingInformationFormatError("Mã triệu chứng phải là chuỗi không rỗng")
    return value
