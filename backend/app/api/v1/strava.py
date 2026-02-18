"""Strava OAuth and activity sync endpoints."""

import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.db.session import async_session_factory
from app.models.external_import import ExternalImport
from app.models.strava_connection import StravaConnection
from app.services.import_service import ImportService
from app.services.strava_service import StravaService

router = APIRouter(prefix="/strava", tags=["strava"])


# ---- Response Schemas ----

class StravaAuthURLResponse(BaseModel):
    auth_url: str
    state: str


class StravaCallbackRequest(BaseModel):
    code: str
    state: str


class StravaConnectionStatus(BaseModel):
    connected: bool
    athlete_name: str | None = None
    athlete_profile_url: str | None = None
    last_sync_at: str | None = None
    auto_sync: bool = False


class StravaSyncRequest(BaseModel):
    strava_activity_id: int


class StravaSyncResponse(BaseModel):
    import_id: str
    status: str
    message: str


# ---- Helpers ----

def _make_strava_service() -> StravaService:
    return StravaService(settings=get_settings())


def _serialize_parsed_activity(parsed) -> dict:
    """Convert ParsedActivity to a JSONB-safe dict for raw_metadata storage."""

    def _dt_str(dt) -> str | None:
        return dt.isoformat() if dt else None

    return {
        "distance_meters": parsed.distance_meters,
        "duration_seconds": parsed.duration_seconds,
        "total_elapsed_seconds": parsed.total_elapsed_seconds,
        "avg_pace_seconds_per_km": parsed.avg_pace_seconds_per_km,
        "best_pace_seconds_per_km": parsed.best_pace_seconds_per_km,
        "avg_speed_ms": parsed.avg_speed_ms,
        "max_speed_ms": parsed.max_speed_ms,
        "elevation_gain_meters": parsed.elevation_gain_meters,
        "elevation_loss_meters": parsed.elevation_loss_meters,
        "elevation_profile": parsed.elevation_profile,
        "route_coordinates": parsed.route_coordinates,
        "started_at": _dt_str(parsed.started_at),
        "finished_at": _dt_str(parsed.finished_at),
        "source_device": parsed.source_device,
        "splits": [
            {
                "split_number": s.split_number,
                "distance_meters": s.distance_meters,
                "duration_seconds": s.duration_seconds,
                "pace_seconds_per_km": s.pace_seconds_per_km,
                "elevation_change_meters": s.elevation_change_meters,
            }
            for s in parsed.splits
        ],
        "points": [
            {
                "lat": pt.lat,
                "lng": pt.lng,
                "alt": pt.alt,
                "timestamp": _dt_str(pt.timestamp),
                "heart_rate": pt.heart_rate,
            }
            for pt in parsed.points
        ],
    }


async def _run_strava_import_in_background(
    import_id: UUID,
    user_id: UUID,
) -> None:
    """Background task: process Strava import through the standard pipeline."""
    import_service = ImportService()
    async with async_session_factory() as db:
        await import_service.process_import(db, import_id, user_id)


# ---- Endpoints ----

@router.get("/auth-url", response_model=StravaAuthURLResponse)
async def get_strava_auth_url(
    current_user: CurrentUser,
) -> StravaAuthURLResponse:
    """Generate Strava OAuth authorization URL."""
    settings = get_settings()
    state = secrets.token_urlsafe(16)
    auth_url = (
        f"https://www.strava.com/oauth/authorize"
        f"?client_id={settings.STRAVA_CLIENT_ID}"
        f"&redirect_uri={settings.STRAVA_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=activity:read_all"
        f"&state={state}"
    )
    return StravaAuthURLResponse(auth_url=auth_url, state=state)


@router.post("/callback", response_model=StravaConnectionStatus)
async def strava_callback(
    body: StravaCallbackRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> StravaConnectionStatus:
    """Exchange OAuth code for tokens and persist StravaConnection."""
    svc = _make_strava_service()
    try:
        conn = await svc.exchange_code(db, current_user.id, body.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return StravaConnectionStatus(
        connected=True,
        athlete_name=conn.athlete_name,
        athlete_profile_url=conn.athlete_profile_url,
        last_sync_at=(
            conn.last_sync_at.isoformat() if conn.last_sync_at else None
        ),
        auto_sync=conn.auto_sync,
    )


@router.get("/status", response_model=StravaConnectionStatus)
async def get_strava_status(
    current_user: CurrentUser,
    db: DbSession,
) -> StravaConnectionStatus:
    """Return current Strava connection status."""
    result = await db.execute(
        select(StravaConnection).where(
            StravaConnection.user_id == current_user.id
        )
    )
    conn = result.scalar_one_or_none()
    if conn is None:
        return StravaConnectionStatus(connected=False)

    return StravaConnectionStatus(
        connected=True,
        athlete_name=conn.athlete_name,
        athlete_profile_url=conn.athlete_profile_url,
        last_sync_at=(
            conn.last_sync_at.isoformat() if conn.last_sync_at else None
        ),
        auto_sync=conn.auto_sync,
    )


@router.get("/activities")
async def list_strava_activities(
    current_user: CurrentUser,
    db: DbSession,
    per_page: int = Query(default=30, le=100),
    after_ts: int | None = Query(default=None),
) -> list[dict]:
    """List recent running activities from Strava."""
    result = await db.execute(
        select(StravaConnection).where(
            StravaConnection.user_id == current_user.id
        )
    )
    conn = result.scalar_one_or_none()
    if conn is None:
        raise HTTPException(status_code=400, detail="Strava not connected")

    svc = _make_strava_service()
    try:
        access_token = await svc.ensure_fresh_token(db, conn)
        activities = await svc.list_activities(access_token, per_page, after_ts)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Strava API error: {exc}"
        )

    # Filter to running activities only
    return [
        {
            "id": a["id"],
            "name": a.get("name"),
            "sport_type": a.get("sport_type"),
            "start_date": a.get("start_date"),
            "distance": a.get("distance"),
            "moving_time": a.get("moving_time"),
            "total_elevation_gain": a.get("total_elevation_gain"),
        }
        for a in activities
        if a.get("sport_type") in ("Run", "TrailRun", "VirtualRun")
    ]


@router.post("/sync", response_model=StravaSyncResponse, status_code=201)
async def sync_strava_activity(
    body: StravaSyncRequest,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> StravaSyncResponse:
    """Import a specific Strava activity by ID."""
    # Load connection
    result = await db.execute(
        select(StravaConnection).where(
            StravaConnection.user_id == current_user.id
        )
    )
    conn = result.scalar_one_or_none()
    if conn is None:
        raise HTTPException(status_code=400, detail="Strava not connected")

    # Prevent duplicate imports
    existing = await db.execute(
        select(ExternalImport).where(
            ExternalImport.user_id == current_user.id,
            ExternalImport.source == "strava",
            ExternalImport.external_id == str(body.strava_activity_id),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="This Strava activity has already been imported",
        )

    # Fetch activity from Strava and serialize
    svc = _make_strava_service()
    try:
        access_token = await svc.ensure_fresh_token(db, conn)
        parsed = await svc.fetch_activity_as_parsed(
            access_token, body.strava_activity_id
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Strava API error: {exc}"
        )

    raw_metadata = _serialize_parsed_activity(parsed)

    # Create import record
    ext_import = ExternalImport(
        user_id=current_user.id,
        source="strava",
        external_id=str(body.strava_activity_id),
        raw_metadata=raw_metadata,
        status="pending",
    )
    db.add(ext_import)
    await db.commit()
    await db.refresh(ext_import)

    # Update last_sync_at
    conn.last_sync_at = datetime.now(timezone.utc)
    await db.commit()

    # Queue background processing
    background_tasks.add_task(
        _run_strava_import_in_background, ext_import.id, current_user.id
    )

    return StravaSyncResponse(
        import_id=str(ext_import.id),
        status="pending",
        message="Strava activity queued for import.",
    )


@router.delete("/disconnect", status_code=204)
async def disconnect_strava(
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Remove Strava connection."""
    svc = _make_strava_service()
    await svc.disconnect(db, current_user.id)
