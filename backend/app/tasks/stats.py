"""Background task: update user and course statistics after a run."""

import logging
from uuid import UUID

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.user import User
from app.models.crew import Crew
from app.models.crew import CrewMember
from app.core.runner_level_config import calc_runner_level
from app.services.stats_service import StatsService

logger = logging.getLogger(__name__)

# Crew level thresholds in meters of cumulative XP
CREW_LEVEL_THRESHOLDS = [
    0, 100_000, 500_000, 1_500_000, 5_000_000,
    15_000_000, 50_000_000, 150_000_000, 500_000_000, 1_000_000_000,
]


def calc_crew_level(total_xp: int) -> int:
    """Calculate crew level from cumulative XP (distance in meters)."""
    for i in range(len(CREW_LEVEL_THRESHOLDS) - 1, -1, -1):
        if total_xp >= CREW_LEVEL_THRESHOLDS[i]:
            return i + 1
    return 1


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
            await stats_service.update_user_cumulative_stats(
                db, user_id, distance_meters, course_id, run_record_id=run_record_id,
            )

            if course_id is not None:
                await stats_service.update_course_stats(db, course_id)

            # Update runner level
            user = await db.get(User, user_id)
            if user is not None:
                new_level = calc_runner_level(user.total_distance_meters)
                if new_level != user.runner_level:
                    logger.info("Runner level up: user=%s, %d → %d", user_id, user.runner_level, new_level)
                    user.runner_level = new_level

            # Update crew XP for all crews the user belongs to
            crew_result = await db.execute(
                select(CrewMember.crew_id).where(CrewMember.user_id == user_id)
            )
            crew_ids = [row[0] for row in crew_result.all()]
            for cid in crew_ids:
                crew = await db.get(Crew, cid)
                if crew is not None:
                    crew.total_xp += distance_meters
                    crew.level = calc_crew_level(crew.total_xp)

            await db.commit()
            logger.info("Stats updated successfully for run %s", run_record_id)

    except Exception:
        logger.exception("Failed to update stats for run %s", run_record_id)
