"""Crew ranking service: crew leaderboard calculation and queries."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.crew import Crew, CrewMember
from app.models.crew_challenge import (
    CrewChallenge,
    CrewChallengeRecord,
    CrewCourseRanking,
)

logger = logging.getLogger(__name__)


class CrewRankingService:
    """Handles crew-level ranking calculation and leaderboard queries."""

    MIN_COMPLETED_FOR_RANKING = 2

    async def update_member_best(
        self,
        db: AsyncSession,
        challenge_id: UUID,
        user_id: UUID,
        duration_seconds: int,
        pace_seconds_per_km: int,
    ) -> None:
        """Update a member's best time in a crew challenge and recalculate ranking."""
        result = await db.execute(
            select(CrewChallengeRecord).where(
                CrewChallengeRecord.challenge_id == challenge_id,
                CrewChallengeRecord.user_id == user_id,
            )
        )
        record = result.scalar_one_or_none()
        if record is None:
            # Auto-create record on first run
            record = CrewChallengeRecord(
                challenge_id=challenge_id,
                user_id=user_id,
                run_count=0,
            )
            db.add(record)
            await db.flush()

        # Only update if better than previous best
        if (
            record.best_duration_seconds is None
            or duration_seconds < record.best_duration_seconds
        ):
            record.best_duration_seconds = duration_seconds
            record.best_pace_seconds_per_km = pace_seconds_per_km
            record.completed_at = datetime.now(timezone.utc)

        record.run_count += 1
        await db.flush()

        # Recalculate crew ranking
        challenge = await db.get(CrewChallenge, challenge_id)
        if challenge:
            await self.update_crew_ranking(db, challenge_id)
            await self.recalculate_crew_ranks(db, challenge.course_id)

    async def update_crew_ranking(
        self,
        db: AsyncSession,
        crew_challenge_id: UUID,
    ) -> None:
        """Recalculate and upsert crew ranking based on completed records."""
        challenge = await db.get(CrewChallenge, crew_challenge_id)
        if challenge is None:
            return

        # Get records with completed times
        result = await db.execute(
            select(CrewChallengeRecord).where(
                CrewChallengeRecord.challenge_id == crew_challenge_id,
                CrewChallengeRecord.best_duration_seconds.is_not(None),
            )
        )
        completed_records = result.scalars().all()
        completed_count = len(completed_records)

        # Get or find existing ranking entry for (course_id, crew_id)
        ranking_result = await db.execute(
            select(CrewCourseRanking).where(
                CrewCourseRanking.course_id == challenge.course_id,
                CrewCourseRanking.crew_id == challenge.crew_id,
            )
        )
        ranking = ranking_result.scalar_one_or_none()

        if completed_count < self.MIN_COMPLETED_FOR_RANKING:
            # Remove ranking if exists but not enough completions
            if ranking:
                await db.delete(ranking)
                await db.flush()
            return

        # Calculate average duration
        total_duration = sum(r.best_duration_seconds for r in completed_records)
        avg_duration = total_duration // completed_count

        # Get crew info
        crew = await db.get(Crew, challenge.crew_id)
        crew_name = crew.name if crew else "Unknown"
        total_participants = crew.member_count if crew else 0

        now = datetime.now(timezone.utc)

        if ranking:
            # Check if new average is better before updating achieved_at
            is_better = avg_duration < ranking.avg_duration_seconds
            ranking.avg_duration_seconds = avg_duration
            ranking.completed_count = completed_count
            ranking.total_participants = total_participants
            ranking.crew_name = crew_name
            ranking.crew_challenge_id = challenge.id
            ranking.updated_at = now
            if is_better or ranking.achieved_at is None:
                ranking.achieved_at = now
        else:
            ranking = CrewCourseRanking(
                course_id=challenge.course_id,
                crew_id=challenge.crew_id,
                crew_challenge_id=challenge.id,
                crew_name=crew_name,
                avg_duration_seconds=avg_duration,
                completed_count=completed_count,
                total_participants=total_participants,
                achieved_at=now,
                updated_at=now,
            )
            db.add(ranking)

        await db.flush()

    async def recalculate_crew_ranks(
        self,
        db: AsyncSession,
        course_id: UUID,
    ) -> None:
        """Recalculate cached rank values for all crew rankings on a course."""
        result = await db.execute(
            select(CrewCourseRanking)
            .where(CrewCourseRanking.course_id == course_id)
            .order_by(CrewCourseRanking.avg_duration_seconds)
        )
        rankings = result.scalars().all()

        for i, ranking in enumerate(rankings):
            ranking.rank = i + 1

        await db.flush()

    async def get_course_crew_rankings(
        self,
        db: AsyncSession,
        course_id: UUID,
        page: int = 0,
        per_page: int = 20,
        requesting_user_id: UUID | None = None,
    ) -> dict:
        """Get paginated crew ranking leaderboard for a course."""
        # Total count
        total_result = await db.execute(
            select(func.count(CrewCourseRanking.id)).where(
                CrewCourseRanking.course_id == course_id
            )
        )
        total_crews = total_result.scalar() or 0

        # Paginated rankings with crew info
        result = await db.execute(
            select(CrewCourseRanking)
            .where(CrewCourseRanking.course_id == course_id)
            .options(joinedload(CrewCourseRanking.crew))
            .order_by(CrewCourseRanking.avg_duration_seconds)
            .offset(page * per_page)
            .limit(per_page)
        )
        rankings = result.scalars().unique().all()

        data = []
        for i, ranking in enumerate(rankings):
            rank = ranking.rank if ranking.rank else page * per_page + i + 1
            data.append(self._ranking_to_dict(ranking, rank))

        # Get requesting user's crews that might not be in the paginated result
        my_crews: list[dict] = []
        if requesting_user_id:
            # Find all crews this user belongs to
            member_result = await db.execute(
                select(CrewMember.crew_id).where(
                    CrewMember.user_id == requesting_user_id
                )
            )
            user_crew_ids = [row[0] for row in member_result.all()]

            if user_crew_ids:
                my_result = await db.execute(
                    select(CrewCourseRanking)
                    .where(
                        CrewCourseRanking.course_id == course_id,
                        CrewCourseRanking.crew_id.in_(user_crew_ids),
                    )
                    .options(joinedload(CrewCourseRanking.crew))
                )
                my_rankings = my_result.scalars().unique().all()

                for ranking in my_rankings:
                    # Skip if already in main data
                    if any(d["crew_id"] == str(ranking.crew_id) for d in data):
                        continue
                    rank = ranking.rank or 0
                    my_crews.append(self._ranking_to_dict(ranking, rank))

        return {
            "data": data,
            "my_crews": my_crews,
            "total_crews": total_crews,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ranking_to_dict(ranking: CrewCourseRanking, rank: int) -> dict:
        """Convert a CrewCourseRanking to a response dictionary."""
        crew = ranking.crew
        return {
            "rank": rank,
            "crew_id": str(ranking.crew_id),
            "crew_name": ranking.crew_name,
            "crew_logo_url": crew.logo_url if crew else None,
            "crew_badge_color": crew.badge_color if crew else None,
            "avg_duration_seconds": ranking.avg_duration_seconds,
            "completed_count": ranking.completed_count,
            "total_participants": ranking.total_participants,
            "achieved_at": ranking.achieved_at,
        }
