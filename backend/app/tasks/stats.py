"""Background task: update user and course statistics after a run."""

import logging
from uuid import UUID

from app.db.session import async_session_factory
from app.services.stats_service import StatsService

logger = logging.getLogger(__name__)


async def update_stats_after_run(
    user_id: UUID,
    run_record_id: UUID,
    course_id: UUID | None,
    distance_meters: int,
) -> None:
    """Update user cumulative stats and course stats after a run completes.

    This runs as a FastAPI BackgroundTask to avoid blocking the response.

    Args:
        user_id: The runner.
        run_record_id: The completed run record.
        course_id: The course (None for free runs).
        distance_meters: Distance of the completed run.
    """
    logger.info(
        "Updating stats: user=%s, run=%s, course=%s, distance=%d",
        user_id,
        run_record_id,
        course_id,
        distance_meters,
    )

    try:
        stats_service = StatsService()

        async with async_session_factory() as db:
            await stats_service.update_user_cumulative_stats(db, user_id, distance_meters)

            if course_id is not None:
                await stats_service.update_course_stats(db, course_id)

            await db.commit()
            logger.info("Stats updated successfully for run %s", run_record_id)

    except Exception:
        logger.exception("Failed to update stats for run %s", run_record_id)
