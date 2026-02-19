"""Unit tests for JWT creation/verification and token hashing utilities."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_token,
    verify_token_hash,
)

settings = get_settings()


# ── Access token ────────────────────────────────────────────────────


class TestCreateAccessToken:
    def test_returns_valid_jwt(self):
        user_id = str(uuid.uuid4())
        token = create_access_token(subject=user_id)

        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        assert payload["sub"] == user_id
        assert payload["type"] == "access"

    def test_contains_exp_and_iat_claims(self):
        token = create_access_token(subject="user-123")
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        assert "exp" in payload
        assert "iat" in payload

    def test_extra_claims_included(self):
        token = create_access_token(
            subject="user-123", extra_claims={"role": "admin"}
        )
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        assert payload["role"] == "admin"

    def test_expiration_matches_config(self):
        before = datetime.now(timezone.utc)
        token = create_access_token(subject="user-123")
        after = datetime.now(timezone.utc)

        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        # JWT exp is an integer (epoch seconds), so allow ±1s tolerance
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)

        expected_min = before + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES) - timedelta(seconds=1)
        expected_max = after + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES) + timedelta(seconds=1)
        assert expected_min <= exp <= expected_max


class TestDecodeAccessToken:
    def test_decodes_valid_token(self):
        user_id = str(uuid.uuid4())
        token = create_access_token(subject=user_id)
        payload = decode_access_token(token)
        assert payload["sub"] == user_id

    def test_rejects_invalid_token(self):
        with pytest.raises(JWTError):
            decode_access_token("not-a-valid-jwt")

    def test_rejects_expired_token(self):
        now = datetime.now(timezone.utc)
        payload = {
            "sub": "user-123",
            "exp": now - timedelta(hours=1),
            "iat": now - timedelta(hours=2),
            "type": "access",
        }
        token = jwt.encode(
            payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )
        with pytest.raises(JWTError):
            decode_access_token(token)

    def test_rejects_wrong_token_type(self):
        now = datetime.now(timezone.utc)
        payload = {
            "sub": "user-123",
            "exp": now + timedelta(hours=1),
            "iat": now,
            "type": "refresh",
        }
        token = jwt.encode(
            payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )
        with pytest.raises(JWTError, match="Invalid token type"):
            decode_access_token(token)

    def test_rejects_wrong_secret(self):
        now = datetime.now(timezone.utc)
        payload = {
            "sub": "user-123",
            "exp": now + timedelta(hours=1),
            "iat": now,
            "type": "access",
        }
        token = jwt.encode(payload, "wrong-secret", algorithm=settings.JWT_ALGORITHM)
        with pytest.raises(JWTError):
            decode_access_token(token)


# ── Refresh token ───────────────────────────────────────────────────


class TestRefreshToken:
    def test_generates_url_safe_string(self):
        token = create_refresh_token()
        assert isinstance(token, str)
        assert len(token) > 20

    def test_generates_unique_tokens(self):
        tokens = {create_refresh_token() for _ in range(100)}
        assert len(tokens) == 100


# ── Token hashing ───────────────────────────────────────────────────


class TestTokenHashing:
    def test_hash_is_deterministic(self):
        token = "test-token-value"
        assert hash_token(token) == hash_token(token)

    def test_different_tokens_different_hashes(self):
        assert hash_token("token-a") != hash_token("token-b")

    def test_verify_correct_token(self):
        token = "my-secret-refresh-token"
        hashed = hash_token(token)
        assert verify_token_hash(token, hashed) is True

    def test_verify_incorrect_token(self):
        hashed = hash_token("correct-token")
        assert verify_token_hash("wrong-token", hashed) is False

    def test_hash_is_sha256_hex(self):
        hashed = hash_token("test")
        assert len(hashed) == 64
        assert all(c in "0123456789abcdef" for c in hashed)
