"""Authentication request/response schemas."""

from typing import Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Social login request."""
    provider: Literal["kakao", "apple", "google", "naver"]
    token: str = Field(..., min_length=1, description="Kakao access_token or Apple id_token")
    nonce: str | None = Field(None, description="Apple Sign In nonce (required for Apple)")


class DevLoginRequest(BaseModel):
    """Dev bypass login - creates or reuses a test user."""
    nickname: str = Field("dev_user", max_length=12)
    email: str = Field("dev@runcrew.test")


class LoginUserInfo(BaseModel):
    """User info returned as part of auth response."""
    id: str
    email: str | None
    nickname: str | None = None
    is_new_user: bool


class AuthResponse(BaseModel):
    """Login response with tokens and user info."""
    access_token: str
    refresh_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int = Field(description="Token TTL in seconds")
    user: LoginUserInfo


class RefreshRequest(BaseModel):
    """Token refresh request."""
    refresh_token: str = Field(..., min_length=1)


class RefreshResponse(BaseModel):
    """Token refresh response with rotated tokens."""
    access_token: str
    refresh_token: str
    expires_in: int


class ErrorResponse(BaseModel):
    """Standard API error response."""
    code: str
    message: str
    details: dict | None = None
