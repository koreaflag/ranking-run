"""Ranking service: leaderboard queries and ranking updates."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import case, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.ranking import Ranking
from app.models.run_record import RunRecord


class RankingService:
    """Handles course leaderboards, personal rankings, and rank recalculation."""

    async def get_course_rankings(
        self,
        db: AsyncSession,
        course_id: UUID,
        page: int = 0,
        per_page: int = 20,
        requesting_user_id: UUID | None = None,
    ) -> dict:
        """Get paginated course leaderboard."""
        total_result = await db.execute(
            select(func.count(Ranking.id)).where(Ranking.course_id == course_id)
        )
        total_runners = total_result.scalar() or 0

        result = await db.execute(
            select(Ranking)
            .where(Ranking.course_id == course_id)
            .options(joinedload(Ranking.user))
            .order_by(Ranking.best_duration_seconds)
            .offset(page * per_page)
            .limit(per_page)
        )
        rankings = result.scalars().unique().all()

        data = []
        for i, ranking in enumerate(rankings):
            rank = page * per_page + i + 1
            data.append({
                "rank": ranking.rank if ranking.rank else rank,
                "user": {
                    "id": str(ranking.user.id),
                    "nickname": ranking.user.nickname,
                    "avatar_url": ranking.user.avatar_url,
                    "crew_name": ranking.user.crew_name,
                    "runner_level": ranking.user.runner_level,
                },
                "best_duration_seconds": ranking.best_duration_seconds,
                "best_pace_seconds_per_km": ranking.best_pace_seconds_per_km,
                "run_count": ranking.run_count,
                "achieved_at": ranking.achieved_at,
            })

        my_ranking = None
        if requesting_user_id:
            my_result = await db.execute(
                select(Ranking).where(
                    Ranking.course_id == course_id,
                    Ranking.user_id == requesting_user_id,
                )
            )
            my_entry = my_result.scalar_one_or_none()
            if my_entry:
                my_ranking = {
                    "rank": my_entry.rank or await self._compute_rank(db, course_id, my_entry.best_duration_seconds),
                    "best_duration_seconds": my_entry.best_duration_seconds,
                    "best_pace_seconds_per_km": my_entry.best_pace_seconds_per_km,
                }

        return {
            "data": data,
            "my_ranking": my_ranking,
            "total_runners": total_runners,
        }

    async def get_my_ranking(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
    ) -> dict:
        """Get the current user's ranking on a specific course."""
        total_result = await db.execute(
            select(func.count(Ranking.id)).where(Ranking.course_id == course_id)
        )
        total_runners = total_result.scalar() or 0

        result = await db.execute(
            select(Ranking).where(
                Ranking.course_id == course_id,
                Ranking.user_id == user_id,
            )
        )
        my_entry = result.scalar_one_or_none()

        if my_entry is None:
            return {
                "rank": None,
                "best_duration_seconds": None,
                "total_runners": total_runners,
                "percentile": None,
            }

        rank = my_entry.rank or await self._compute_rank(db, course_id, my_entry.best_duration_seconds)
        percentile = (rank / total_runners * 100) if total_runners > 0 else None

        return {
            "rank": rank,
            "best_duration_seconds": my_entry.best_duration_seconds,
            "total_runners": total_runners,
            "percentile": round(percentile, 1) if percentile is not None else None,
        }

    async def get_my_best(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
    ) -> dict | None:
        """Get the user's personal best record on a course."""
        result = await db.execute(
            select(RunRecord)
            .where(
                RunRecord.course_id == course_id,
                RunRecord.user_id == user_id,
                RunRecord.course_completed == True,
            )
            .order_by(RunRecord.duration_seconds)
            .limit(1)
        )
        best = result.scalar_one_or_none()

        if best is None:
            return None

        return {
            "id": str(best.id),
            "duration_seconds": best.duration_seconds,
            "avg_pace_seconds_per_km": best.avg_pace_seconds_per_km,
            "finished_at": best.finished_at,
        }

    async def upsert_ranking(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
        duration_seconds: int,
        pace_seconds_per_km: int,
        achieved_at: datetime,
    ) -> Ranking:
        """Insert or update a user's ranking entry for a course.

        Uses PostgreSQL INSERT ... ON CONFLICT DO UPDATE to avoid race
        conditions when concurrent run completions target the same
        (course_id, user_id) pair.
        """
        stmt = pg_insert(Ranking).values(
            course_id=course_id,
            user_id=user_id,
            best_duration_seconds=duration_seconds,
            best_pace_seconds_per_km=pace_seconds_per_km,
            run_count=1,
            achieved_at=achieved_at,
        )

        stmt = stmt.on_conflict_do_update(
            constraint="idx_rankings_course_user",
            set_={
                "run_count": Ranking.run_count + 1,
                "best_duration_seconds": case(
                    (stmt.excluded.best_duration_seconds < Ranking.best_duration_seconds,
                     stmt.excluded.best_duration_seconds),
                    else_=Ranking.best_duration_seconds,
                ),
                "best_pace_seconds_per_km": case(
                    (stmt.excluded.best_duration_seconds < Ranking.best_duration_seconds,
                     stmt.excluded.best_pace_seconds_per_km),
                    else_=Ranking.best_pace_seconds_per_km,
                ),
                "achieved_at": case(
                    (stmt.excluded.best_duration_seconds < Ranking.best_duration_seconds,
                     stmt.excluded.achieved_at),
                    else_=Ranking.achieved_at,
                ),
                "updated_at": func.now(),
            },
        ).returning(Ranking)

        result = await db.execute(stmt)
        ranking = result.scalar_one()
        await db.flush()
        return ranking

    async def recalculate_ranks(self, db: AsyncSession, course_id: UUID) -> None:
        """Recalculate cached rank values for all entries on a course."""
        await db.execute(
            text(
                "UPDATE rankings SET rank = sub.new_rank "
                "FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY best_duration_seconds ASC) as new_rank "
                "FROM rankings WHERE course_id = :course_id) sub "
                "WHERE rankings.id = sub.id"
            ),
            {"course_id": str(course_id)},
        )
        await db.flush()

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    async def _compute_rank(
        self,
        db: AsyncSession,
        course_id: UUID,
        duration: int,
    ) -> int:
        """Compute a user's rank based on duration."""
        result = await db.execute(
            select(func.count(Ranking.id)).where(
                Ranking.course_id == course_id,
                Ranking.best_duration_seconds < duration,
            )
        )
        count = result.scalar() or 0
        return count + 1
