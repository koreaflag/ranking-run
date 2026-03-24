"""Admin error monitoring endpoints."""

from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.error_log import ErrorLog

router = APIRouter(prefix="/admin", tags=["admin"])

bearer_scheme = HTTPBearer(auto_error=False)


async def require_admin_or_service(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> dict:
    """Verify that the caller has admin or service role in their JWT."""
    if credentials is None:
        raise AuthenticationError(code="AUTH_REQUIRED", message="Not authenticated")

    try:
        payload = decode_access_token(credentials.credentials)
    except (JWTError, ValueError):
        raise AuthenticationError(code="AUTH_EXPIRED", message="Invalid or expired token")

    role = payload.get("role")
    if role not in ("admin", "service"):
        raise PermissionDeniedError(
            code="FORBIDDEN", message="Admin or service role required"
        )
    return payload


AdminAuth = Annotated[dict, Depends(require_admin_or_service)]
DbSession = Annotated[AsyncSession, Depends(get_db)]


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class ErrorLogItem(BaseModel):
    id: str
    error_type: str
    message: str
    traceback: str
    endpoint: str | None
    method: str | None
    user_id: str | None
    status_code: int
    request_body: str | None
    created_at: datetime


class ErrorLogListResponse(BaseModel):
    items: list[ErrorLogItem]
    total: int
    page: int
    page_size: int


class ErrorTypeCount(BaseModel):
    error_type: str
    count: int


class ErrorStatsResponse(BaseModel):
    errors_24h: int
    errors_7d: int
    top_errors: list[ErrorTypeCount]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/errors", response_model=ErrorLogListResponse)
async def list_errors(
    _auth: AdminAuth,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    error_type: str | None = Query(None, description="Filter by error type"),
) -> ErrorLogListResponse:
    """List recent error logs with pagination (newest first)."""
    base_query = select(ErrorLog)
    count_query = select(func.count(ErrorLog.id))

    if error_type:
        base_query = base_query.where(ErrorLog.error_type == error_type)
        count_query = count_query.where(ErrorLog.error_type == error_type)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        base_query.order_by(desc(ErrorLog.created_at))
        .offset(offset)
        .limit(page_size)
    )
    rows = result.scalars().all()

    items = [
        ErrorLogItem(
            id=str(r.id),
            error_type=r.error_type,
            message=r.message,
            traceback=r.traceback,
            endpoint=r.endpoint,
            method=r.method,
            user_id=str(r.user_id) if r.user_id else None,
            status_code=r.status_code,
            request_body=r.request_body,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return ErrorLogListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


@router.get("/errors/stats", response_model=ErrorStatsResponse)
async def error_stats(
    _auth: AdminAuth,
    db: DbSession,
) -> ErrorStatsResponse:
    """Error statistics: counts for 24h/7d and top 5 error types."""
    now = datetime.now(timezone.utc)
    t_24h = now - timedelta(hours=24)
    t_7d = now - timedelta(days=7)

    # Count last 24 hours
    r24 = await db.execute(
        select(func.count(ErrorLog.id)).where(ErrorLog.created_at >= t_24h)
    )
    errors_24h = r24.scalar() or 0

    # Count last 7 days
    r7d = await db.execute(
        select(func.count(ErrorLog.id)).where(ErrorLog.created_at >= t_7d)
    )
    errors_7d = r7d.scalar() or 0

    # Top 5 error types (last 7 days)
    top_result = await db.execute(
        select(ErrorLog.error_type, func.count(ErrorLog.id).label("cnt"))
        .where(ErrorLog.created_at >= t_7d)
        .group_by(ErrorLog.error_type)
        .order_by(desc("cnt"))
        .limit(5)
    )
    top_errors = [
        ErrorTypeCount(error_type=row.error_type, count=row.cnt)
        for row in top_result.all()
    ]

    return ErrorStatsResponse(
        errors_24h=errors_24h,
        errors_7d=errors_7d,
        top_errors=top_errors,
    )
