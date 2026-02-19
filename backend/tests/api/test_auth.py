"""API tests for authentication endpoints."""

from unittest.mock import AsyncMock, MagicMock


# ── Dev login ───────────────────────────────────────────────────────


class TestDevLogin:
    async def test_creates_new_user(self, client, mock_db):
        """POST /api/v1/auth/dev-login → 200 with tokens (new user)."""
        response = await client.post(
            "/api/v1/auth/dev-login",
            json={"nickname": "DevRunner", "email": "dev@test.com"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "Bearer"
        assert data["expires_in"] > 0
        assert data["user"]["email"] == "dev@test.com"
        assert data["user"]["nickname"] == "DevRunner"
        assert data["user"]["is_new_user"] is True

    async def test_reuses_existing_user(self, client, mock_db, test_user):
        """If email already exists, return existing user (is_new_user=false)."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = test_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        response = await client.post(
            "/api/v1/auth/dev-login",
            json={"nickname": "Ignored", "email": "test@runcrew.app"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["user"]["is_new_user"] is False
        assert data["user"]["id"] == str(test_user.id)

    async def test_defaults(self, client, mock_db):
        """Empty JSON body should use schema defaults."""
        response = await client.post("/api/v1/auth/dev-login", json={})

        assert response.status_code == 200
        data = response.json()
        assert data["user"]["nickname"] == "dev_user"
        assert data["user"]["email"] == "dev@runcrew.test"

    async def test_token_expiry_matches_config(self, client, mock_db):
        """expires_in should match ACCESS_TOKEN_EXPIRE_MINUTES * 60."""
        from app.core.config import get_settings

        settings = get_settings()

        response = await client.post("/api/v1/auth/dev-login", json={})
        data = response.json()

        assert data["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


# ── Refresh token endpoint ──────────────────────────────────────────


class TestRefreshEndpoint:
    async def test_missing_token_returns_422(self, client):
        """POST /api/v1/auth/refresh with empty body → 422."""
        response = await client.post("/api/v1/auth/refresh", json={})
        assert response.status_code == 422

    async def test_empty_token_returns_422(self, client):
        """Empty string refresh token should fail validation."""
        response = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": ""}
        )
        assert response.status_code == 422


# ── Login endpoint validation ───────────────────────────────────────


class TestLoginValidation:
    async def test_missing_provider_returns_422(self, client):
        """POST /api/v1/auth/login without provider → 422."""
        response = await client.post(
            "/api/v1/auth/login", json={"token": "some-id-token"}
        )
        assert response.status_code == 422

    async def test_invalid_provider_returns_422(self, client):
        """Unsupported provider should be rejected by schema."""
        response = await client.post(
            "/api/v1/auth/login",
            json={"provider": "facebook", "token": "some-token"},
        )
        assert response.status_code == 422

    async def test_missing_token_returns_422(self, client):
        """Login without token → 422."""
        response = await client.post(
            "/api/v1/auth/login", json={"provider": "apple"}
        )
        assert response.status_code == 422
