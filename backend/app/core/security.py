"""JWT creation/verification and password hashing utilities."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()


def create_access_token(
    subject: str,
    extra_claims: Optional[dict[str, Any]] = None,
) -> str:
    """Create a JWT access token.

    Args:
        subject: The user ID to encode as the 'sub' claim.
        extra_claims: Additional claims to include in the token.

    Returns:
        Encoded JWT string.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(subject),
        "exp": expire,
        "iat": now,
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token() -> str:
    """Generate a cryptographically secure random refresh token string."""
    return secrets.token_urlsafe(64)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT access token.

    Args:
        token: The encoded JWT string.

    Returns:
        The decoded payload dictionary.

    Raises:
        JWTError: If the token is invalid or expired.
    """
    payload = jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )
    if payload.get("type") != "access":
        raise JWTError("Invalid token type")
    return payload


def hash_token(token: str) -> str:
    """Hash a refresh token for secure DB storage (SHA-256)."""
    return hashlib.sha256(token.encode()).hexdigest()


def verify_token_hash(plain_token: str, hashed_token: str) -> bool:
    """Verify a refresh token against its stored hash."""
    return secrets.compare_digest(hash_token(plain_token), hashed_token)
