"""Auth endpoints: social login and token refresh."""

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends

from app.core.config import get_settings
from app.core.container import Container
from app.core.deps import DbSession
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    LoginUserInfo,
    RefreshRequest,
    RefreshResponse,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthResponse)
@inject
async def login(
    body: LoginRequest,
    db: DbSession,
    auth_service: AuthService = Depends(Provide[Container.auth_service]),
) -> AuthResponse:
    """Social login with Kakao or Apple."""
    result = await auth_service.social_login(
        db=db,
        provider=body.provider,
        token=body.token,
        nonce=body.nonce,
    )

    return AuthResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        expires_in=result["expires_in"],
        user=LoginUserInfo(**result["user"]),
    )


@router.post("/refresh", response_model=RefreshResponse)
@inject
async def refresh_token(
    body: RefreshRequest,
    db: DbSession,
    auth_service: AuthService = Depends(Provide[Container.auth_service]),
) -> RefreshResponse:
    """Refresh an expired access token using a valid refresh token."""
    user, new_access_token, new_refresh_token = await auth_service.validate_and_rotate_refresh_token(
        db=db,
        raw_token=body.refresh_token,
    )

    settings = get_settings()
    return RefreshResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
