"""Push notification endpoints: device token registration and removal."""

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
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
