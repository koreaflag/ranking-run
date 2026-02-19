"""Shared test fixtures for the RunCrew backend test suite.

Environment variables are set BEFORE any app module import so that
get_settings() (lru-cached) always returns test-safe values.
"""

import os
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

# ── Test environment ────────────────────────────────────────────────
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests")
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test_runcrew")
os.environ.setdefault("DEBUG", "true")

# Clear any previously cached Settings so the test env vars take effect.
from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.core.security import create_access_token  # noqa: E402
from app.models.user import User  # noqa: E402


# ── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def test_user_id() -> uuid.UUID:
    """Deterministic user ID for test reproducibility."""
    return uuid.UUID("00000000-0000-4000-a000-000000000001")


@pytest.fixture
def test_user(test_user_id):
    """In-memory User model instance (not persisted to DB)."""
    now = datetime.now(timezone.utc)
    user = User(
        email="test@runcrew.app",
        nickname="TestRunner",
        height_cm=175.0,
        weight_kg=70.0,
        total_distance_meters=12500,
        total_runs=3,
    )
    user.id = test_user_id
    user.created_at = now
    user.updated_at = now
    return user


@pytest.fixture
def auth_token(test_user) -> str:
    """Valid JWT access token for test_user."""
    return create_access_token(subject=str(test_user.id))


@pytest.fixture
def mock_db():
    """Mock async DB session.

    By default, execute() returns a result whose scalar_one_or_none() is None
    and whose scalars().all() is [].  Override per-test as needed.
    """
    session = AsyncMock()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_result.scalars.return_value.all.return_value = []
    mock_result.scalar.return_value = 0
    mock_result.all.return_value = []

    session.execute = AsyncMock(return_value=mock_result)
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.close = AsyncMock()
    session.delete = AsyncMock()
    return session


@pytest.fixture
async def client(test_user, mock_db):
    """Authenticated async HTTP test client.

    Overrides:
      * get_db           → yields mock_db
      * get_current_user → returns test_user
    """
    from httpx import ASGITransport, AsyncClient as _AsyncClient

    from app.db.session import get_db
    from app.core.deps import get_current_user
    from app.main import app

    async def _override_db():
        yield mock_db

    async def _override_user():
        return test_user

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user

    async with _AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def unauth_client(mock_db):
    """Unauthenticated async HTTP test client (no auth override).

    Protected endpoints should return 401.
    """
    from httpx import ASGITransport, AsyncClient as _AsyncClient

    from app.db.session import get_db
    from app.main import app

    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db

    async with _AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
