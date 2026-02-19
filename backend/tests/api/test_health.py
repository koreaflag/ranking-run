"""Test the health check endpoint (no auth, no DB required)."""

from httpx import ASGITransport, AsyncClient


async def test_health_returns_200():
    """GET /health → 200 with status and env info."""
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        response = await ac.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "RunCrew"
    assert "env" in data


async def test_health_json_content_type():
    """Health response should be JSON."""
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        response = await ac.get("/health")

    assert response.headers["content-type"] == "application/json"
