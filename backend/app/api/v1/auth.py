"""Auth endpoints: social login, dev bypass, and token refresh."""

from datetime import datetime, timedelta, timezone

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from app.core.config import get_settings
from app.core.container import Container
from app.core.deps import DbSession
from app.core.exceptions import AppError
from app.core.security import create_access_token, create_refresh_token, hash_token
from app.models.user import RefreshToken, User
from app.schemas.auth import (
    AuthResponse,
    DevLoginRequest,
    LoginRequest,
    LoginUserInfo,
    RefreshRequest,
    RefreshResponse,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/dev-login", response_model=AuthResponse, status_code=status.HTTP_200_OK)
async def dev_login(body: DevLoginRequest, db: DbSession) -> AuthResponse:
    """Dev-only login: creates or reuses a test user and returns tokens.

    Only available when APP_ENV=development.
    """
    settings = get_settings()
    if settings.APP_ENV != "development":
        raise AppError(code="DEV_ONLY", message="This endpoint is only available in development mode")

    result = await db.execute(
        select(User).where(User.email == body.email)
    )
    user = result.scalar_one_or_none()
    is_new = False

    if user is None:
        user = User(email=body.email, nickname=body.nickname)
        db.add(user)
        await db.flush()
        is_new = True

    access_token = create_access_token(subject=str(user.id))
    raw_refresh = create_refresh_token()

    refresh_obj = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(refresh_obj)
    await db.flush()

    return AuthResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=LoginUserInfo(
            id=str(user.id),
            email=user.email,
            nickname=user.nickname,
            is_new_user=is_new,
        ),
    )


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
