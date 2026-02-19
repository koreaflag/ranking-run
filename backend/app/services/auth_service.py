"""Authentication service: social login verification, user creation, token management."""

from datetime import datetime, timedelta, timezone
from typing import Tuple
from uuid import UUID

import httpx
from jose import jwt as jose_jwt, jwk, JWTError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import AuthenticationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_token,
    verify_token_hash,
)
from app.models.user import RefreshToken, SocialAccount, User


class AuthService:
    """Handles social login verification, user creation, and token management."""

    # Class-level Apple key cache (shared across Factory instances)
    _apple_public_keys_cache: dict | None = None
    _apple_keys_fetched_at: datetime | None = None
    _APPLE_KEYS_CACHE_TTL = timedelta(hours=24)

    def __init__(self, settings: Settings):
        self._settings = settings

    # -----------------------------------------------------------------------
    # Apple login
    # -----------------------------------------------------------------------

    async def _fetch_apple_public_keys(self) -> dict:
        """Fetch Apple's public keys for JWT verification with caching."""
        now = datetime.now(timezone.utc)
        if (
            AuthService._apple_public_keys_cache is not None
            and AuthService._apple_keys_fetched_at is not None
            and now - AuthService._apple_keys_fetched_at < self._APPLE_KEYS_CACHE_TTL
        ):
            return AuthService._apple_public_keys_cache

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://appleid.apple.com/auth/keys",
                timeout=10.0,
            )

        if response.status_code != 200:
            raise AuthenticationError(
                code="APPLE_KEYS_FETCH_FAILED",
                message="Failed to fetch Apple public keys",
            )

        keys_data = response.json()
        AuthService._apple_public_keys_cache = keys_data
        AuthService._apple_keys_fetched_at = now
        return keys_data

    async def verify_apple_token(self, id_token: str, nonce: str | None = None) -> dict:
        """Decode and verify an Apple id_token JWT."""
        try:
            unverified_header = jose_jwt.get_unverified_header(id_token)
            kid = unverified_header.get("kid")
            if not kid:
                raise AuthenticationError(code="APPLE_AUTH_FAILED", message="Missing kid in token header")

            keys_data = await self._fetch_apple_public_keys()
            matching_key = None
            for key_dict in keys_data.get("keys", []):
                if key_dict["kid"] == kid:
                    matching_key = key_dict
                    break

            if matching_key is None:
                raise AuthenticationError(code="APPLE_AUTH_FAILED", message="No matching Apple public key found")

            public_key = jwk.construct(matching_key, algorithm="RS256")

            payload = jose_jwt.decode(
                id_token,
                public_key,
                algorithms=["RS256"],
                audience=self._settings.APPLE_BUNDLE_ID,
                issuer="https://appleid.apple.com",
            )

            if nonce and payload.get("nonce") != nonce:
                raise AuthenticationError(code="APPLE_AUTH_FAILED", message="Nonce mismatch")

            return {
                "provider_id": payload["sub"],
                "email": payload.get("email"),
            }

        except JWTError as e:
            raise AuthenticationError(
                code="APPLE_AUTH_FAILED",
                message=f"Apple token verification failed: {str(e)}",
            )

    # -----------------------------------------------------------------------
    # Google login
    # -----------------------------------------------------------------------

    async def verify_google_token(self, id_token: str) -> dict:
        """Verify Google id_token using Google's tokeninfo endpoint."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}",
                timeout=10.0,
            )

        if response.status_code != 200:
            raise AuthenticationError(
                code="GOOGLE_AUTH_FAILED",
                message="Google token verification failed",
            )

        data = response.json()
        if data.get("aud") != self._settings.GOOGLE_CLIENT_ID:
            raise AuthenticationError(
                code="GOOGLE_AUTH_FAILED",
                message="Google token audience mismatch",
            )

        return {
            "provider_id": data["sub"],
            "email": data.get("email"),
            "nickname": data.get("name"),
            "profile_image_url": data.get("picture"),
        }

    # -----------------------------------------------------------------------
    # Find or create user
    # -----------------------------------------------------------------------

    async def find_or_create_user(
        self,
        db: AsyncSession,
        provider: str,
        provider_id: str,
        email: str | None = None,
        nickname: str | None = None,
    ) -> Tuple[User, bool]:
        """Find existing user by social account or create a new one."""
        result = await db.execute(
            select(SocialAccount).where(
                SocialAccount.provider == provider,
                SocialAccount.provider_id == provider_id,
            )
        )
        social_account = result.scalar_one_or_none()

        if social_account is not None:
            user_result = await db.execute(
                select(User).where(User.id == social_account.user_id)
            )
            user = user_result.scalar_one()
            return user, False

        user = User(email=email)
        db.add(user)
        await db.flush()

        social_account = SocialAccount(
            user_id=user.id,
            provider=provider,
            provider_id=provider_id,
            provider_email=email,
        )
        db.add(social_account)
        await db.flush()

        return user, True

    # -----------------------------------------------------------------------
    # Token management
    # -----------------------------------------------------------------------

    async def store_refresh_token(
        self,
        db: AsyncSession,
        user_id: UUID,
        raw_token: str,
    ) -> None:
        """Hash and store a refresh token in the database."""
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(days=self._settings.REFRESH_TOKEN_EXPIRE_DAYS)

        refresh_token_record = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.add(refresh_token_record)
        await db.flush()

    async def validate_and_rotate_refresh_token(
        self,
        db: AsyncSession,
        raw_token: str,
    ) -> Tuple[User, str, str]:
        """Validate a refresh token, revoke it, and issue a new pair."""
        result = await db.execute(
            select(RefreshToken)
            .where(RefreshToken.expires_at > datetime.now(timezone.utc))
            .order_by(RefreshToken.created_at.desc())
        )
        all_tokens = result.scalars().all()

        matched_token: RefreshToken | None = None
        for token_record in all_tokens:
            if verify_token_hash(raw_token, token_record.token_hash):
                matched_token = token_record
                break

        if matched_token is None:
            raise AuthenticationError(code="AUTH_EXPIRED", message="Invalid refresh token")

        if matched_token.is_revoked:
            await db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == matched_token.user_id)
                .values(is_revoked=True)
            )
            await db.flush()
            raise AuthenticationError(
                code="AUTH_EXPIRED",
                message="Refresh token reuse detected, all tokens revoked",
            )

        if matched_token.expires_at < datetime.now(timezone.utc):
            raise AuthenticationError(code="AUTH_EXPIRED", message="Refresh token expired")

        matched_token.is_revoked = True
        await db.flush()

        user_result = await db.execute(
            select(User).where(User.id == matched_token.user_id)
        )
        user = user_result.scalar_one_or_none()
        if user is None:
            raise AuthenticationError(code="AUTH_EXPIRED", message="User not found")

        new_access_token = create_access_token(subject=str(user.id))
        new_refresh_token = create_refresh_token()
        await self.store_refresh_token(db, user.id, new_refresh_token)

        return user, new_access_token, new_refresh_token

    # -----------------------------------------------------------------------
    # Full login flow
    # -----------------------------------------------------------------------

    async def social_login(
        self,
        db: AsyncSession,
        provider: str,
        token: str,
        nonce: str | None = None,
    ) -> dict:
        """Execute the full social login flow."""
        if provider == "apple":
            social_info = await self.verify_apple_token(token, nonce)
        elif provider == "google":
            social_info = await self.verify_google_token(token)
        else:
            raise AuthenticationError(code="INVALID_PROVIDER", message=f"Unknown provider: {provider}")

        user, is_new_user = await self.find_or_create_user(
            db=db,
            provider=provider,
            provider_id=social_info["provider_id"],
            email=social_info.get("email"),
            nickname=social_info.get("nickname"),
        )

        access_token = create_access_token(subject=str(user.id))
        refresh_token = create_refresh_token()
        await self.store_refresh_token(db, user.id, refresh_token)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": self._settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": {
                "id": str(user.id),
                "email": user.email,
                "provider": provider,
                "is_new_user": is_new_user,
            },
        }
