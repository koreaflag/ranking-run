"""Celery task wrappers for existing background tasks.

Each task creates its own async DB session and delegates to existing
service methods. These are parallel to the current FastAPI BackgroundTasks
implementations and can be swapped in incrementally.
"""

import asyncio
import logging
from uuid import UUID

from celery import shared_task

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from a sync Celery task context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def update_course_stats_task(self, course_id: str) -> None:
    """Update aggregate statistics for a course.

    Wraps StatsService.update_course_stats.
    """
    logger.info("[celery] update_course_stats: course=%s", course_id)
    try:
        _run_async(_update_course_stats(UUID(course_id)))
    except Exception as exc:
        logger.exception("[celery] update_course_stats failed: course=%s", course_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def update_user_stats_task(
    self,
    user_id: str,
    distance_meters: int,
    course_id: str | None = None,
    run_record_id: str | None = None,
) -> None:
    """Update cumulative stats for a user after a run.

    Wraps the full update_stats_after_run flow (user stats, course stats,
    runner level, crew XP).
    """
    logger.info(
        "[celery] update_user_stats: user=%s, distance=%d, course=%s",
        user_id,
        distance_meters,
        course_id,
    )
    try:
        _run_async(
            _update_user_stats(
                UUID(user_id),
                distance_meters,
                UUID(course_id) if course_id else None,
                UUID(run_record_id) if run_record_id else None,
            )
        )
    except Exception as exc:
        logger.exception("[celery] update_user_stats failed: user=%s", user_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def recalculate_rankings_task(
    self,
    course_id: str,
    user_id: str,
    run_record_id: str,
) -> None:
    """Recalculate course rankings after a completed run.

    Wraps the full recalculate_course_ranking flow (rankings, groups,
    crew challenges, streaks).
    """
    logger.info(
        "[celery] recalculate_rankings: course=%s, user=%s, run=%s",
        course_id,
        user_id,
        run_record_id,
    )
    try:
        _run_async(
            _recalculate_rankings(
                UUID(course_id),
                UUID(user_id),
                UUID(run_record_id),
            )
        )
    except Exception as exc:
        logger.exception("[celery] recalculate_rankings failed: course=%s", course_id)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Async implementations (delegate to existing services)
# ---------------------------------------------------------------------------


async def _update_course_stats(course_id: UUID) -> None:
    from app.db.session import async_session_factory
    from app.services.stats_service import StatsService

    stats_service = StatsService()
    async with async_session_factory() as db:
        await stats_service.update_course_stats(db, course_id)
        await db.commit()


async def _update_user_stats(
    user_id: UUID,
    distance_meters: int,
    course_id: UUID | None,
    run_record_id: UUID | None,
) -> None:
    from app.tasks.stats import update_stats_after_run

    await update_stats_after_run(
        user_id=user_id,
        run_record_id=run_record_id,
        course_id=course_id,
        distance_meters=distance_meters,
    )


async def _recalculate_rankings(
    course_id: UUID,
    user_id: UUID,
    run_record_id: UUID,
) -> None:
    from app.tasks.ranking import recalculate_course_ranking

    await recalculate_course_ranking(
        course_id=course_id,
        user_id=user_id,
        run_record_id=run_record_id,
    )
