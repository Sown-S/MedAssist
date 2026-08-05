from fastapi import Request, status
from fastapi.responses import JSONResponse

async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "message": "Đã xảy ra lỗi hệ thống server.",
            "detail": str(exc)
        },
    )