"""Background task: notify followers when a user completes a run."""

import logging
from uuid import UUID

from sqlalchemy import select

from app.db.session import async_session_factory
from app.core.config import get_settings
from app.models.follow import Follow
from app.models.course import Course
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


def _format_distance(meters: int) -> str:
    """Format distance in human-readable form (e.g. '5.2km')."""
    km = meters / 1000
    if km >= 10:
        return f"{km:.1f}km"
    return f"{km:.2f}km"


def _format_duration(seconds: int) -> str:
    """Format duration as mm:ss or h:mm:ss."""
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


async def notify_followers_run_completed(
    user_id: UUID,
    nickname: str | None,
    run_record_id: UUID,
    distance_meters: int,
    duration_seconds: int,
    course_id: UUID | None,
) -> None:
    """Send push + in-app notification to all followers when a run completes.

    Runs as a FastAPI BackgroundTask to avoid blocking the response.
    """
    async with async_session_factory() as db:
        try:
            # Get follower IDs
            result = await db.execute(
                select(Follow.follower_id).where(Follow.following_id == user_id)
            )
            follower_ids = [row[0] for row in result.all()]

            if not follower_ids:
                return

            # Get course title if applicable
            course_title = None
            if course_id:
                course_result = await db.execute(
                    select(Course.title).where(Course.id == course_id)
                )
                course_title = course_result.scalar_one_or_none()

            display_name = nickname or "러너"
            dist_str = _format_distance(distance_meters)
            dur_str = _format_duration(duration_seconds)

            title = f"{display_name}님이 러닝을 완료했어요!"
            if course_title:
                body = f"📍 {course_title} · {dist_str} · {dur_str}"
            else:
                body = f"🏃 {dist_str} · {dur_str}"

            settings = get_settings()
            svc = NotificationService(settings)

            for follower_id in follower_ids:
                try:
                    await svc.create_and_send(
                        db=db,
                        user_id=follower_id,
                        notification_type="run_completed",
                        actor_id=user_id,
                        title=title,
                        body=body,
                        target_id=str(run_record_id),
                        target_type="run",
                        data={
                            "distance_meters": distance_meters,
                            "duration_seconds": duration_seconds,
                            "course_id": str(course_id) if course_id else None,
                        },
                    )
                except Exception:
                    logger.warning(
                        "Failed to notify follower %s about run %s",
                        follower_id,
                        run_record_id,
                    )

            await db.commit()
            logger.info(
                "Notified %d followers about run %s by user %s",
                len(follower_ids),
                run_record_id,
                user_id,
            )
        except Exception:
            logger.exception("notify_followers_run_completed failed for user %s", user_id)
