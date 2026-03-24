"""Global error handler that logs unhandled exceptions to the DB.

Plugs into FastAPI's exception_handler system. If DB logging itself fails,
the original error response is still returned — the handler never crashes the app.
"""

import json
import logging
import re
import traceback
from typing import Any
from uuid import UUID

from fastapi import Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Fields whose values should be masked in request bodies
_SENSITIVE_PATTERN = re.compile(
    r"(password|token|secret|key|authorization|credential|api_key|access_key)",
    re.IGNORECASE,
)
_MASK = "***MASKED***"


def _mask_sensitive(data: Any) -> Any:
    """Recursively mask sensitive fields in a dict/list structure."""
    if isinstance(data, dict):
        return {
            k: (_MASK if _SENSITIVE_PATTERN.search(k) else _mask_sensitive(v))
            for k, v in data.items()
        }
    if isinstance(data, list):
        return [_mask_sensitive(item) for item in data]
    return data


def _extract_user_id(request: Request) -> UUID | None:
    """Try to extract user_id from the request state (set by auth dependency)."""
    try:
        user = getattr(request.state, "user", None)
        if user is not None and hasattr(user, "id"):
            return user.id
    except Exception:
        pass
    return None


async def _safe_read_body(request: Request) -> str | None:
    """Read and mask the request body, returning None on failure."""
    try:
        body_bytes = await request.body()
        if not body_bytes:
            return None
        body_str = body_bytes.decode("utf-8", errors="replace")
        # Truncate very large bodies
        if len(body_str) > 10_000:
            body_str = body_str[:10_000] + "...(truncated)"
        # Try to parse as JSON for masking
        try:
            body_data = json.loads(body_str)
            masked = _mask_sensitive(body_data)
            return json.dumps(masked, ensure_ascii=False)
        except (json.JSONDecodeError, TypeError):
            # Not JSON — mask any key=value patterns
            return re.sub(
                r'(password|token|secret|key)=[^&\s]+',
                r'\1=' + _MASK,
                body_str,
                flags=re.IGNORECASE,
            )
    except Exception:
        return None


async def save_error_log(
    request: Request,
    exc: Exception,
    status_code: int = 500,
) -> None:
    """Persist an error log entry to the database.

    This function is designed to never raise — all internal errors are
    swallowed and logged to stderr so the caller can still return a
    proper HTTP response.
    """
    try:
        from app.db.session import async_session_factory
        from app.models.error_log import ErrorLog

        tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
        tb_str = "".join(tb)

        body_str = await _safe_read_body(request)
        user_id = _extract_user_id(request)

        error_log = ErrorLog(
            error_type=type(exc).__name__,
            message=str(exc)[:2000],  # cap at 2000 chars
            traceback=tb_str[:20_000],  # cap traceback
            endpoint=str(request.url.path),
            method=request.method,
            user_id=user_id,
            status_code=status_code,
            request_body=body_str,
        )

        async with async_session_factory() as session:
            session.add(error_log)
            await session.commit()

    except Exception:
        # Never let error-logging break the app
        logger.exception("Failed to save error log to DB")


def install_error_handlers(app) -> None:  # noqa: ANN001
    """Register global exception handlers on the FastAPI app.

    Call this from main.py AFTER the app is created. It replaces/supplements
    the existing global_exception_handler.
    """
    from app.core.exceptions import AppError

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        """Catch all AppError subclasses and return a uniform JSON response."""
        headers = None
        if exc.status_code == 401:
            headers = {"WWW-Authenticate": "Bearer"}
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
            headers=headers,
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """Fallback handler for truly unexpected errors — log to DB + stderr."""
        logger.exception("Unhandled exception: %s", str(exc))

        # Fire-and-forget DB logging (awaited but safe)
        await save_error_log(request, exc, status_code=500)

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
            },
        )
