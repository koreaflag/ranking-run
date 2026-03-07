"""Background task: ranking recalculation after a course run."""

import logging
from uuid import UUID

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.crew import CrewMember
from app.models.crew_challenge import CrewChallenge, CrewChallengeRecord
from app.models.group_run import GroupRun, GroupRunMember
from app.models.run_record import RunRecord
from app.services.crew_ranking_service import CrewRankingService
from app.services.group_ranking_service import GroupRankingService
from app.services.ranking_service import RankingService

logger = logging.getLogger(__name__)


async def recalculate_course_ranking(
    course_id: UUID,
    user_id: UUID,
    run_record_id: UUID,
) -> None:
    """Recalculate rankings for a course after a completed run.

    Steps:
    1. Fetch the run record to get duration and pace.
    2. Upsert the user's ranking entry (only updates if personal best).
    3. Recalculate cached rank values for all entries on the course.
    4. Update group rankings for any active groups the user belongs to.

    This runs as a FastAPI BackgroundTask.

    Args:
        course_id: The course.
        user_id: The runner.
        run_record_id: The completed run record.
    """
    logger.info(
        "Recalculating ranking: course=%s, user=%s, run=%s",
        course_id,
        user_id,
        run_record_id,
    )

    try:
        ranking_service = RankingService()

        async with async_session_factory() as db:
            result = await db.execute(
                select(RunRecord).where(RunRecord.id == run_record_id)
            )
            run_record = result.scalar_one_or_none()

            if run_record is None:
                logger.warning("Run record %s not found", run_record_id)
                return

            if not run_record.course_completed:
                logger.info("Run %s did not complete the course, skipping ranking", run_record_id)
                return

            pace = None
            if run_record.avg_pace_seconds_per_km is not None:
                pace = run_record.avg_pace_seconds_per_km
            elif run_record.distance_meters > 0:
                pace = int(run_record.duration_seconds / (run_record.distance_meters / 1000))

            if pace is None:
                pace = 0

            await ranking_service.upsert_ranking(
                db=db,
                course_id=course_id,
                user_id=user_id,
                duration_seconds=run_record.duration_seconds,
                pace_seconds_per_km=pace,
                achieved_at=run_record.finished_at,
            )

            await ranking_service.recalculate_ranks(db, course_id)

            # Update group rankings for any active groups the user belongs to
            group_ranking_service = GroupRankingService()
            group_members_result = await db.execute(
                select(GroupRunMember)
                .join(GroupRun, GroupRun.id == GroupRunMember.group_run_id)
                .where(
                    GroupRun.course_id == course_id,
                    GroupRunMember.user_id == user_id,
                    GroupRunMember.status.in_(["accepted", "completed"]),
                    GroupRun.status == "active",
                )
            )
            group_members = group_members_result.scalars().all()

            for member in group_members:
                logger.info(
                    "Updating group ranking: group=%s, user=%s",
                    member.group_run_id,
                    user_id,
                )
                await group_ranking_service.update_member_best(
                    db=db,
                    group_run_id=member.group_run_id,
                    user_id=user_id,
                    duration_seconds=run_record.duration_seconds,
                    pace_seconds_per_km=pace,
                )

            # Update crew challenge records for active raids the user participates in
            crew_ranking_service = CrewRankingService()
            crew_challenges_result = await db.execute(
                select(CrewChallenge)
                .join(CrewMember, CrewMember.crew_id == CrewChallenge.crew_id)
                .where(
                    CrewChallenge.course_id == course_id,
                    CrewChallenge.status == "active",
                    CrewMember.user_id == user_id,
                )
            )
            active_challenges = crew_challenges_result.scalars().all()

            for challenge in active_challenges:
                logger.info(
                    "Updating crew challenge record: challenge=%s, crew=%s, user=%s",
                    challenge.id,
                    challenge.crew_id,
                    user_id,
                )
                await crew_ranking_service.update_member_best(
                    db=db,
                    challenge_id=challenge.id,
                    user_id=user_id,
                    duration_seconds=run_record.duration_seconds,
                    pace_seconds_per_km=pace,
                )

            await db.commit()
            logger.info("Ranking recalculated for course %s", course_id)

    except Exception:
        logger.exception("Failed to recalculate ranking for course %s", course_id)
