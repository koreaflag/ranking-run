"""Background task: bulk Strava activity sync.

Syncs recent running activities from Strava after initial OAuth connection
or a manual sync-all request.  Reuses the same import pipeline as single-
activity sync (ExternalImport -> ImportService.process_import) so that every
imported run gets course matching, stats updates, and ranking recalculation.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.external_import import ExternalImport
from app.models.strava_connection import StravaConnection
from app.services.import_service import ImportService
from app.services.strava_service import StravaService

logger = logging.getLogger(__name__)


async def sync_recent_strava_activities(
    user_id: UUID,
    max_activities: int = 20,
) -> None:
    """Sync recent Strava running activities for a user.

    Called after initial OAuth connection or a manual sync-all request.
    Fetches up to *max_activities* most recent activities and imports any
    running activities that have not already been imported.

    The function manages its own database session (via ``async_session_factory``)
    so it can safely run as a FastAPI BackgroundTask.

    Args:
        user_id: The user whose Strava account to sync.
        max_activities: Maximum number of activities to fetch from Strava.
    """
    from app.core.config import get_settings

    settings = get_settings()
    strava_service = StravaService(settings=settings)
    import_service = ImportService()

    try:
        async with async_session_factory() as db:
            # ---- Load Strava connection ----
            result = await db.execute(
                select(StravaConnection).where(
                    StravaConnection.user_id == user_id,
                )
            )
            connection = result.scalar_one_or_none()

            if connection is None:
                logger.warning("No Strava connection for user %s", user_id)
                return

            # ---- Ensure a fresh access token ----
            access_token = await strava_service.ensure_fresh_token(db, connection)

            # ---- Fetch recent activities from Strava ----
            activities = await strava_service.list_activities(
                access_token=access_token,
                per_page=max_activities,
            )

            synced = 0
            skipped = 0

            for activity in activities:
                # Only import running activities
                sport_type = activity.get("sport_type") or activity.get("type")
                if sport_type not in ("Run", "TrailRun", "VirtualRun"):
                    continue

                strava_activity_id = str(activity["id"])

                try:
                    # ---- Check for duplicate import ----
                    existing = await db.execute(
                        select(ExternalImport.id).where(
                            ExternalImport.user_id == user_id,
                            ExternalImport.source == "strava",
                            ExternalImport.external_id == strava_activity_id,
                        )
                    )
                    if existing.scalar_one_or_none() is not None:
                        skipped += 1
                        continue

                    # ---- Fetch full activity data + GPS streams ----
                    parsed = await strava_service.fetch_activity_as_parsed(
                        access_token, int(activity["id"])
                    )

                    # Serialize to JSONB-safe dict (same helper the single-sync endpoint uses)
                    raw_metadata = _serialize_parsed_activity(parsed)

                    # ---- Create ExternalImport record ----
                    ext_import = ExternalImport(
                        user_id=user_id,
                        source="strava",
                        external_id=strava_activity_id,
                        raw_metadata=raw_metadata,
                        status="pending",
                    )
                    db.add(ext_import)
                    await db.flush()

                    # ---- Run through standard import pipeline ----
                    await import_service.process_import(db, ext_import.id, user_id)
                    synced += 1

                except Exception:
                    logger.exception(
                        "Failed to sync Strava activity %s for user %s",
                        strava_activity_id,
                        user_id,
                    )
                    # Roll back partial changes for this activity and continue
                    await db.rollback()
                    continue

            # ---- Update last sync timestamp ----
            # Re-fetch connection because rollback may have expired it
            result = await db.execute(
                select(StravaConnection).where(
                    StravaConnection.user_id == user_id,
                )
            )
            connection = result.scalar_one_or_none()
            if connection is not None:
                connection.last_sync_at = datetime.now(timezone.utc)
                await db.commit()

            logger.info(
                "Strava sync complete for user %s: synced=%d, skipped=%d",
                user_id,
                synced,
                skipped,
            )

    except Exception:
        logger.exception("Strava sync failed for user %s", user_id)


def _serialize_parsed_activity(parsed) -> dict:
    """Convert ParsedActivity to a JSONB-safe dict for raw_metadata storage.

    Mirrors the ``_serialize_parsed_activity`` helper in the strava API module.
    Extracted here so the background task does not depend on the API layer.
    """

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
