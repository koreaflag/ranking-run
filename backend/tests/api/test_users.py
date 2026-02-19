"""API tests for user profile endpoints."""

import uuid
from unittest.mock import AsyncMock, MagicMock

from app.models.user import User


# ── GET /users/me ───────────────────────────────────────────────────


class TestGetMyProfile:
    async def test_returns_user_data(self, client, test_user):
        """GET /api/v1/users/me → 200 with current user's profile."""
        response = await client.get("/api/v1/users/me")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(test_user.id)
        assert data["email"] == "test@runcrew.app"
        assert data["nickname"] == "TestRunner"
        assert data["total_distance_meters"] == 12500
        assert data["total_runs"] == 3
        assert data["height_cm"] == 175.0
        assert data["weight_kg"] == 70.0

    async def test_unauthenticated_returns_401(self, unauth_client):
        """GET /api/v1/users/me without auth → 401."""
        response = await unauth_client.get("/api/v1/users/me")
        assert response.status_code == 401


# ── POST /users/me/profile (initial setup) ──────────────────────────


class TestSetupProfile:
    async def test_sets_nickname(self, client, test_user):
        """Onboarding profile setup should update nickname."""
        response = await client.post(
            "/api/v1/users/me/profile",
            json={"nickname": "NewRunner"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["nickname"] == "NewRunner"
        assert data["id"] == str(test_user.id)

    async def test_sets_nickname_and_avatar(self, client, test_user):
        """Profile setup accepts both nickname and avatar URL."""
        response = await client.post(
            "/api/v1/users/me/profile",
            json={
                "nickname": "RunnerX",
                "avatar_url": "https://cdn.example.com/avatar.jpg",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["nickname"] == "RunnerX"
        assert data["avatar_url"] == "https://cdn.example.com/avatar.jpg"

    async def test_nickname_too_short_returns_422(self, client):
        """Nickname < 2 chars → 422 validation error."""
        response = await client.post(
            "/api/v1/users/me/profile",
            json={"nickname": "A"},
        )
        assert response.status_code == 422

    async def test_nickname_too_long_returns_422(self, client):
        """Nickname > 12 chars → 422 validation error."""
        response = await client.post(
            "/api/v1/users/me/profile",
            json={"nickname": "VeryLongNickname"},
        )
        assert response.status_code == 422

    async def test_duplicate_nickname_returns_409(self, client, mock_db, test_user):
        """Existing nickname should return 409 Conflict."""
        other_user = User(nickname="TakenName")
        other_user.id = uuid.UUID("00000000-0000-4000-a000-000000000099")

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = other_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        response = await client.post(
            "/api/v1/users/me/profile",
            json={"nickname": "TakenName"},
        )

        assert response.status_code == 409
        assert response.json()["code"] == "DUPLICATE_NICKNAME"


# ── PATCH /users/me/profile (update) ────────────────────────────────


class TestUpdateProfile:
    async def test_updates_nickname(self, client, test_user):
        """PATCH should update the nickname."""
        response = await client.patch(
            "/api/v1/users/me/profile",
            json={"nickname": "UpdatedName"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["nickname"] == "UpdatedName"

    async def test_updates_multiple_fields(self, client, test_user):
        """PATCH should handle multiple fields at once."""
        response = await client.patch(
            "/api/v1/users/me/profile",
            json={
                "bio": "I love running!",
                "height_cm": 180.0,
                "weight_kg": 75.0,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["bio"] == "I love running!"
        assert data["height_cm"] == 180.0
        assert data["weight_kg"] == 75.0

    async def test_updates_instagram(self, client, test_user):
        """PATCH instagram_username field."""
        response = await client.patch(
            "/api/v1/users/me/profile",
            json={"instagram_username": "runner_dev"},
        )

        assert response.status_code == 200
        assert response.json()["instagram_username"] == "runner_dev"

    async def test_empty_body_returns_200(self, client):
        """PATCH with no fields should succeed (no-op)."""
        response = await client.patch(
            "/api/v1/users/me/profile",
            json={},
        )
        assert response.status_code == 200

    async def test_duplicate_nickname_returns_409(self, client, mock_db, test_user):
        """Updating to an existing nickname should return 409."""
        other_user = User(nickname="AlreadyTaken")
        other_user.id = uuid.UUID("00000000-0000-4000-a000-000000000099")

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = other_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        response = await client.patch(
            "/api/v1/users/me/profile",
            json={"nickname": "AlreadyTaken"},
        )

        assert response.status_code == 409
        assert response.json()["code"] == "DUPLICATE_NICKNAME"

    async def test_unauthenticated_returns_401(self, unauth_client):
        """PATCH without auth → 401."""
        response = await unauth_client.patch(
            "/api/v1/users/me/profile",
            json={"nickname": "Hacker"},
        )
        assert response.status_code == 401
