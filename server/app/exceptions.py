"""Định dạng lỗi thống nhất cho mọi API (tiếng Việt, có mã lỗi để client xử lý).

    {"error": {"code": "VALIDATION_ERROR", "message": "Dữ liệu không hợp lệ",
               "details": [{"field": "vital_signs.spo2_pct", "in": "body", "message": "..."}],
               "request_id": "3f2a..."}}

Nguyên tắc: KHÔNG trả chi tiết nội bộ (câu SQL, tên bảng, traceback) ra client; lỗi 500 chỉ
có request_id để tra log server.
"""
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger, request_id_var

_logger = get_logger("errors")


class AppError(Exception):
    """Lỗi nghiệp vụ chủ động ném từ service/router: raise AppError(404, "NOT_FOUND", "...")."""

    def __init__(self, status_code: int, code: str, message: str,
                 details: list[dict[str, Any]] | None = None) -> None:
        super().__init__(message)
        self.status_code, self.code, self.message, self.details = status_code, code, message, details


class NotFoundError(AppError):
    def __init__(self, message: str = "Không tìm thấy dữ liệu") -> None:
        super().__init__(404, "NOT_FOUND", message)


class ConflictError(AppError):
    def __init__(self, message: str, details: list[dict[str, Any]] | None = None) -> None:
        super().__init__(409, "CONFLICT", message, details)


_STATUS_CODES = {
    400: ("BAD_REQUEST", "Yêu cầu không hợp lệ"),
    401: ("UNAUTHORIZED", "Chưa đăng nhập hoặc phiên đã hết hạn"),
    403: ("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này"),
    404: ("NOT_FOUND", "Không tìm thấy"),
    405: ("METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ"),
    409: ("CONFLICT", "Dữ liệu xung đột"),
    413: ("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn"),
    422: ("VALIDATION_ERROR", "Dữ liệu không hợp lệ"),
    429: ("RATE_LIMITED", "Thao tác quá nhiều lần, vui lòng thử lại sau"),
}


def _body(status_code: int, code: str, message: str, details=None, headers=None) -> JSONResponse:
    error: dict[str, Any] = {"code": code, "message": message, "request_id": request_id_var.get()}
    if details:
        error["details"] = details
    return JSONResponse(status_code=status_code, content={"error": error}, headers=headers)


# ---- Thông báo tiếng Việt cho lỗi kiểm tra của Pydantic ------------------------------
def _num(value: Any) -> Any:
    """100.0 -> 100 cho dễ đọc."""
    return int(value) if isinstance(value, float) and value.is_integer() else value


def _vi_message(err: dict[str, Any]) -> str:
    t = err.get("type", "")
    ctx = {k: _num(v) for k, v in (err.get("ctx") or {}).items()}
    match t:
        case "missing":
            return "Thiếu trường bắt buộc"
        case "extra_forbidden":
            return "Trường không được phép"
        case "string_too_short":
            return "Không được để trống" if ctx.get("min_length") == 1 else f"Tối thiểu {ctx.get('min_length')} ký tự"
        case "string_too_long":
            return f"Tối đa {ctx.get('max_length')} ký tự"
        case "string_type":
            return "Phải là chuỗi ký tự"
        case "string_pattern_mismatch":
            return "Sai định dạng"
        case "int_parsing" | "int_type" | "int_from_float":
            return "Phải là số nguyên"
        case "float_parsing" | "float_type" | "decimal_parsing":
            return "Phải là số"
        case "bool_parsing" | "bool_type":
            return "Phải là true hoặc false"
        case "greater_than_equal":
            return f"Phải lớn hơn hoặc bằng {ctx.get('ge')}"
        case "greater_than":
            return f"Phải lớn hơn {ctx.get('gt')}"
        case "less_than_equal":
            return f"Phải nhỏ hơn hoặc bằng {ctx.get('le')}"
        case "less_than":
            return f"Phải nhỏ hơn {ctx.get('lt')}"
        case "uuid_parsing" | "uuid_type":
            return "Không phải mã UUID hợp lệ"
        case "literal_error" | "enum":
            return f"Phải là một trong: {ctx.get('expected', '')}".rstrip(": ")
        case "date_parsing" | "date_from_datetime_parsing" | "date_type":
            return "Ngày không hợp lệ (định dạng YYYY-MM-DD)"
        case "datetime_parsing" | "datetime_from_date_parsing" | "datetime_type":
            return "Thời gian không hợp lệ (ISO 8601)"
        case "json_invalid":
            return "JSON không hợp lệ"
        case "dict_type" | "model_type" | "model_attributes_type":
            return "Phải là một object"
        case "list_type":
            return "Phải là một danh sách"
        case "value_error" | "assertion_error":
            # ValueError do validator của ta ném: thông điệp đã là tiếng Việt
            return str(ctx.get("error") or err.get("msg", "")).removeprefix("Value error, ")
        case _:
            return err.get("msg", "Giá trị không hợp lệ")


def _validation_details(errors) -> list[dict[str, Any]]:
    details = []
    for err in errors:
        loc = [str(p) for p in err.get("loc", ())]
        where = loc[0] if loc and loc[0] in {"body", "query", "path", "header", "cookie"} else None
        field = ".".join(loc[1:] if where else loc)
        item = {"field": field or (where or ""), "message": _vi_message(err)}
        if where:
            item["in"] = where
        details.append(item)
    return details


# ---- Lỗi ràng buộc CSDL -> lỗi nghiệp vụ dễ hiểu ---------------------------------------
_SQLSTATE = {
    "23505": (409, "CONFLICT", "Dữ liệu đã tồn tại hoặc trùng lặp"),
    "23503": (409, "INVALID_REFERENCE", "Dữ liệu tham chiếu không tồn tại hoặc đang được sử dụng"),
    "23514": (422, "CONSTRAINT_VIOLATION", "Dữ liệu vi phạm quy tắc nghiệp vụ"),
    "23502": (422, "CONSTRAINT_VIOLATION", "Thiếu dữ liệu bắt buộc"),
    "23P01": (409, "CONFLICT", "Dữ liệu xung đột"),
}


def _constraint_name(exc: DBAPIError) -> str | None:
    diag = getattr(getattr(exc, "orig", None), "diag", None)
    return getattr(diag, "constraint_name", None)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return _body(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        code, default_msg = _STATUS_CODES.get(exc.status_code, (f"HTTP_{exc.status_code}", "Lỗi yêu cầu"))
        message = exc.detail if isinstance(exc.detail, str) and exc.detail else default_msg
        if exc.status_code == 404 and message == "Not Found":
            message = "Không tìm thấy đường dẫn"
        if exc.status_code == 405 and message == "Method Not Allowed":
            message = default_msg
        return _body(exc.status_code, code, message, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        return _body(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", _validation_details(exc.errors()))

    @app.exception_handler(IntegrityError)
    async def _integrity_error(request: Request, exc: IntegrityError):
        sqlstate = getattr(exc.orig, "sqlstate", None)
        status_code, code, message = _SQLSTATE.get(sqlstate, (409, "CONFLICT", "Dữ liệu xung đột"))
        constraint = _constraint_name(exc)
        _logger.warning("IntegrityError %s constraint=%s on %s %s", sqlstate, constraint,
                        request.method, request.url.path)
        # Tên ràng buộc (vd chk_visit_vital_signs_keys) giúp client chỉ ra trường sai; không lộ dữ liệu
        details = [{"constraint": constraint}] if constraint else None
        return _body(status_code, code, message, details)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        _logger.exception("Lỗi không xử lý được: %s %s", request.method, request.url.path)
        return _body(500, "INTERNAL_ERROR",
                     "Lỗi hệ thống. Vui lòng thử lại hoặc báo quản trị viên kèm mã request_id.")
