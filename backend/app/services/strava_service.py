"""Strava service: OAuth token management, activity fetching, stream parsing."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.strava_connection import StravaConnection
from app.services.file_parser import TrackPoint, build_activity

logger = logging.getLogger(__name__)

STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"


class StravaService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def exchange_code(
        self,
        db: AsyncSession,
        user_id: UUID,
        code: str,
    ) -> StravaConnection:
        """Exchange OAuth authorization code for access+refresh tokens."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                STRAVA_TOKEN_URL,
                data={
                    "client_id": self._settings.STRAVA_CLIENT_ID,
                    "client_secret": self._settings.STRAVA_CLIENT_SECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                },
                timeout=15.0,
            )
        if resp.status_code != 200:
            raise ValueError(f"Strava token exchange failed: {resp.text}")

        data = resp.json()
        athlete = data.get("athlete", {})
        expires_at = datetime.fromtimestamp(data["expires_at"], tz=timezone.utc)
        athlete_name = (
            f"{athlete.get('firstname', '')} {athlete.get('lastname', '')}".strip()
            or None
        )

        # Upsert: update existing or insert new
        result = await db.execute(
            select(StravaConnection).where(StravaConnection.user_id == user_id)
        )
        conn = result.scalar_one_or_none()

        if conn is None:
            conn = StravaConnection(user_id=user_id)
            db.add(conn)

        conn.strava_athlete_id = str(athlete["id"])
        conn.athlete_name = athlete_name
        conn.athlete_profile_url = athlete.get("profile")
        conn.access_token = data["access_token"]
        conn.refresh_token = data["refresh_token"]
        conn.token_expires_at = expires_at

        await db.commit()
        await db.refresh(conn)
        return conn

    async def ensure_fresh_token(
        self,
        db: AsyncSession,
        conn: StravaConnection,
    ) -> str:
        """Return a valid access token, refreshing if within 5 minutes of expiry."""
        now = datetime.now(timezone.utc)
        if (conn.token_expires_at - now).total_seconds() > 300:
            return conn.access_token

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                STRAVA_TOKEN_URL,
                data={
                    "client_id": self._settings.STRAVA_CLIENT_ID,
                    "client_secret": self._settings.STRAVA_CLIENT_SECRET,
                    "refresh_token": conn.refresh_token,
                    "grant_type": "refresh_token",
                },
                timeout=15.0,
            )
        if resp.status_code != 200:
            raise ValueError(f"Strava token refresh failed: {resp.text}")

        data = resp.json()
        conn.access_token = data["access_token"]
        conn.refresh_token = data["refresh_token"]
        conn.token_expires_at = datetime.fromtimestamp(
            data["expires_at"], tz=timezone.utc
        )
        await db.commit()
        return conn.access_token

    async def list_activities(
        self,
        access_token: str,
        per_page: int = 30,
        after_ts: int | None = None,
    ) -> list[dict]:
        """Fetch recent running activities from Strava API."""
        params: dict = {"per_page": per_page}
        if after_ts:
            params["after"] = after_ts

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{STRAVA_API_BASE}/athlete/activities",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
                timeout=15.0,
            )
        if resp.status_code != 200:
            raise ValueError(f"Strava activities fetch failed: {resp.status_code}")
        return resp.json()

    async def fetch_activity_as_parsed(
        self,
        access_token: str,
        strava_activity_id: int,
    ):
        """Fetch activity detail + GPS streams and convert to ParsedActivity."""
        headers = {"Authorization": f"Bearer {access_token}"}

        async with httpx.AsyncClient() as client:
            # Fetch activity metadata
            detail_resp = await client.get(
                f"{STRAVA_API_BASE}/activities/{strava_activity_id}",
                headers=headers,
                timeout=15.0,
            )
            detail_resp.raise_for_status()
            detail = detail_resp.json()

            # Fetch GPS streams
            streams_resp = await client.get(
                f"{STRAVA_API_BASE}/activities/{strava_activity_id}/streams",
                headers=headers,
                params={
                    "keys": "latlng,altitude,time,heartrate,distance",
                    "key_type": "time",
                },
                timeout=15.0,
            )
            streams_resp.raise_for_status()
            streams_data = streams_resp.json()

        return self._streams_to_parsed_activity(detail, streams_data)

    def _streams_to_parsed_activity(self, detail: dict, streams_data: list[dict]):
        """Convert Strava streams to ParsedActivity via build_activity()."""
        from app.services.file_parser import ParsedActivity

        # Index streams by type
        streams: dict[str, list] = {}
        for s in streams_data:
            streams[s["type"]] = s["data"]

        latlng = streams.get("latlng", [])
        if not latlng:
            return ParsedActivity()

        altitudes = streams.get("altitude", [])
        time_offsets = streams.get("time", [])
        heart_rates = streams.get("heartrate", [])

        # Parse start_date (ISO 8601 UTC)
        start_date_str = detail.get("start_date")
        started_at: datetime | None = None
        if start_date_str:
            started_at = datetime.fromisoformat(
                start_date_str.replace("Z", "+00:00")
            )

        points: list[TrackPoint] = []
        for i, (lat, lng) in enumerate(latlng):
            alt = altitudes[i] if i < len(altitudes) else 0.0
            ts = None
            if started_at and i < len(time_offsets):
                ts = started_at + timedelta(seconds=time_offsets[i])
            hr = heart_rates[i] if i < len(heart_rates) else None
            points.append(
                TrackPoint(
                    lat=lat,
                    lng=lng,
                    alt=alt or 0.0,
                    timestamp=ts,
                    heart_rate=hr,
                )
            )

        if not points:
            return ParsedActivity()

        sport_type = detail.get("sport_type", "Run")
        return build_activity(points, source_device=f"Strava/{sport_type}")

    async def disconnect(self, db: AsyncSession, user_id: UUID) -> None:
        """Remove the StravaConnection for a user."""
        result = await db.execute(
            select(StravaConnection).where(StravaConnection.user_id == user_id)
        )
        conn = result.scalar_one_or_none()
        if conn:
            await db.delete(conn)
            await db.commit()
