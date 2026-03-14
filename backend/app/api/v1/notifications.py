"""Push notification endpoints: device token, inbox, read status."""

from uuid import UUID

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.notification import (
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
)
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ------------------------------------------------------------------
# Request / Response schemas
# ------------------------------------------------------------------

class RegisterTokenRequest(BaseModel):
    device_token: str = Field(..., min_length=1, description="FCM device token")
    platform: str = Field(..., pattern="^(ios|android)$", description="Device platform")


class RegisterTokenResponse(BaseModel):
    status: str = "ok"


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.post("/token", response_model=RegisterTokenResponse, status_code=201)
@inject
async def register_device_token(
    request: RegisterTokenRequest,
    current_user: CurrentUser,
    db: DbSession,
    notification_service: NotificationService = Depends(Provide[Container.notification_service]),
) -> dict:
    """Register a device token for push notifications.

    If the token already exists (e.g. from a previous user), it is reassigned
    to the currently authenticated user.
    """
    await notification_service.register_token(
        db=db,
        user_id=current_user.id,
        device_token=request.device_token,
        platform=request.platform,
    )
    return {"status": "ok"}


@router.delete("/token", response_model=RegisterTokenResponse)
@inject
async def unregister_device_token(
    request: RegisterTokenRequest,
    current_user: CurrentUser,
    db: DbSession,
    notification_service: NotificationService = Depends(Provide[Container.notification_service]),
) -> dict:
    """Remove a device token (e.g. on logout)."""
    await notification_service.unregister_token(db=db, device_token=request.device_token)
    return {"status": "ok"}


# ------------------------------------------------------------------
# Inbox endpoints
# ------------------------------------------------------------------


@router.get("", response_model=NotificationListResponse)
@inject
async def get_notifications(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    notification_service: NotificationService = Depends(
        Provide[Container.notification_service]
    ),
) -> NotificationListResponse:
    """Get paginated notification inbox."""
    items, total_count, unread_count = await notification_service.get_notifications(
        db=db,
        user_id=current_user.id,
        page=page,
        per_page=per_page,
    )
    return NotificationListResponse(
        data=[NotificationResponse(**item) for item in items],
        total_count=total_count,
        unread_count=unread_count,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
@inject
async def get_unread_count(
    current_user: CurrentUser,
    db: DbSession,
    notification_service: NotificationService = Depends(
        Provide[Container.notification_service]
    ),
) -> UnreadCountResponse:
    """Get count of unread notifications."""
    count = await notification_service.get_unread_count(
        db=db, user_id=current_user.id
    )
    return UnreadCountResponse(count=count)


@router.post("/{notification_id}/read", status_code=204)
@inject
async def mark_as_read(
    notification_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    notification_service: NotificationService = Depends(
        Provide[Container.notification_service]
    ),
) -> None:
    """Mark a single notification as read."""
    await notification_service.mark_as_read(
        db=db, notification_id=notification_id, user_id=current_user.id
    )


@router.post("/read-all", status_code=204)
@inject
async def mark_all_as_read(
    current_user: CurrentUser,
    db: DbSession,
    notification_service: NotificationService = Depends(
        Provide[Container.notification_service]
    ),
) -> None:
    """Mark all notifications as read."""
    await notification_service.mark_all_as_read(
        db=db, user_id=current_user.id
    )
