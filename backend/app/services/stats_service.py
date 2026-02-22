"""Stats service: user statistics, weekly summaries, and course stats recalculation."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import distinct, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course, CourseStats
from app.models.ranking import Ranking
from app.models.run_record import RunRecord
from app.models.user import User


class StatsService:
    """Handles user statistics, weekly summaries, and course stats aggregation."""

    async def get_user_stats(
        self,
        db: AsyncSession,
        user_id: UUID,
        period: str = "all",
    ) -> dict:
        """Calculate comprehensive user statistics."""
        now = datetime.now(timezone.utc)
        date_filter = self._get_date_filter(period, now)

        agg_result = await db.execute(
            select(
                func.count(RunRecord.id).label("total_runs"),
                func.coalesce(func.sum(RunRecord.distance_meters), 0).label("total_distance"),
                func.coalesce(func.sum(RunRecord.duration_seconds), 0).label("total_duration"),
                func.min(RunRecord.avg_pace_seconds_per_km).label("best_pace"),
                func.max(RunRecord.distance_meters).label("longest_run"),
                func.coalesce(func.sum(RunRecord.elevation_gain_meters), 0).label("total_elevation"),
                func.coalesce(func.sum(RunRecord.calories), 0).label("total_calories"),
            ).where(
                RunRecord.user_id == user_id,
                RunRecord.finished_at >= date_filter if date_filter else True,
            )
        )
        row = agg_result.one()

        total_runs = row.total_runs or 0
        total_distance = row.total_distance or 0
        total_duration = row.total_duration or 0
        best_pace = row.best_pace
        longest_run = row.longest_run or 0
        total_elevation = row.total_elevation or 0
        total_calories = row.total_calories or 0

        avg_pace = None
        if total_distance > 0:
            avg_pace = int(total_duration / (total_distance / 1000))

        avg_distance_per_run = int(total_distance / total_runs) if total_runs > 0 else 0

        courses_created_result = await db.execute(
            select(func.count(Course.id)).where(Course.creator_id == user_id)
        )
        courses_created = courses_created_result.scalar() or 0

        courses_completed_result = await db.execute(
            select(func.count(distinct(RunRecord.course_id))).where(
                RunRecord.user_id == user_id,
                RunRecord.course_completed == True,
            )
        )
        courses_completed = courses_completed_result.scalar() or 0

        course_runs_result = await db.execute(
            select(func.count(RunRecord.id)).where(
                RunRecord.user_id == user_id,
                RunRecord.course_id.isnot(None),
            )
        )
        total_course_runs = course_runs_result.scalar() or 0

        top10_result = await db.execute(
            select(func.count(Ranking.id)).where(
                Ranking.user_id == user_id,
                Ranking.rank <= 10,
            )
        )
        ranking_top10_count = top10_result.scalar() or 0

        current_streak, best_streak = await self._calculate_streaks(db, user_id)

        monthly_distance = await self._get_monthly_distance(db, user_id, months=6)

        return {
            "total_distance_meters": total_distance,
            "total_duration_seconds": total_duration,
            "total_runs": total_runs,
            "avg_pace_seconds_per_km": avg_pace,
            "avg_distance_per_run_meters": avg_distance_per_run,
            "best_pace_seconds_per_km": best_pace,
            "longest_run_meters": longest_run,
            "total_elevation_gain_meters": total_elevation,
            "estimated_calories": total_calories,
            "current_streak_days": current_streak,
            "best_streak_days": best_streak,
            "courses_created": courses_created,
            "courses_completed": courses_completed,
            "total_course_runs": total_course_runs,
            "ranking_top10_count": ranking_top10_count,
            "monthly_distance": monthly_distance,
        }

    async def get_weekly_stats(self, db: AsyncSession, user_id: UUID) -> dict:
        """Calculate weekly summary statistics for the home screen."""
        now = datetime.now(timezone.utc)
        this_week_start = now - timedelta(days=now.weekday())
        this_week_start = this_week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        this_week_end = this_week_start + timedelta(days=7)
        last_week_start = this_week_start - timedelta(days=7)

        this_week = await self._get_period_stats(db, user_id, this_week_start, this_week_end)

        last_week_end = this_week_start
        last_week = await self._get_period_stats(db, user_id, last_week_start, last_week_end)

        compared_percent = 0.0
        if last_week["total_distance"] > 0:
            compared_percent = (
                (this_week["total_distance"] - last_week["total_distance"])
                / last_week["total_distance"]
                * 100
            )

        avg_pace = None
        if this_week["total_distance"] > 0:
            avg_pace = int(this_week["total_duration"] / (this_week["total_distance"] / 1000))

        return {
            "total_distance_meters": this_week["total_distance"],
            "total_duration_seconds": this_week["total_duration"],
            "run_count": this_week["run_count"],
            "avg_pace_seconds_per_km": avg_pace,
            "compared_to_last_week_percent": round(compared_percent, 1),
        }

    async def update_user_cumulative_stats(
        self,
        db: AsyncSession,
        user_id: UUID,
        distance_meters: int,
    ) -> User:
        """Update user's cumulative total_distance_meters and total_runs."""
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one()
        user.total_distance_meters += distance_meters
        user.total_runs += 1
        await db.flush()
        return user

    async def update_course_stats(self, db: AsyncSession, course_id: UUID) -> None:
        """Recalculate and update course statistics."""
        agg = await db.execute(
            select(
                func.count(RunRecord.id).label("total_runs"),
                func.count(distinct(RunRecord.user_id)).label("unique_runners"),
                func.avg(RunRecord.duration_seconds).label("avg_duration"),
                func.min(RunRecord.duration_seconds).label("best_duration"),
            ).where(
                RunRecord.course_id == course_id,
                RunRecord.course_completed == True,
            )
        )
        row = agg.one()

        total_runs = row.total_runs or 0
        unique_runners = row.unique_runners or 0
        avg_duration = int(row.avg_duration) if row.avg_duration else None
        best_duration = row.best_duration

        course_result = await db.execute(
            select(Course.distance_meters).where(Course.id == course_id)
        )
        course_distance = course_result.scalar()

        avg_pace = None
        best_pace = None
        if course_distance and course_distance > 0:
            if avg_duration:
                avg_pace = int(avg_duration / (course_distance / 1000))
            if best_duration:
                best_pace = int(best_duration / (course_distance / 1000))

        total_attempts_result = await db.execute(
            select(func.count(RunRecord.id)).where(RunRecord.course_id == course_id)
        )
        total_attempts = total_attempts_result.scalar() or 0
        completion_rate = total_runs / total_attempts if total_attempts > 0 else 0.0

        hour_result = await db.execute(
            select(
                func.extract("hour", RunRecord.started_at).label("hour"),
                func.count(RunRecord.id).label("count"),
            )
            .where(RunRecord.course_id == course_id)
            .group_by(func.extract("hour", RunRecord.started_at))
        )
        runs_by_hour = {str(int(r.hour)).zfill(2): r.count for r in hour_result.all()}

        stats_result = await db.execute(
            select(CourseStats).where(CourseStats.course_id == course_id)
        )
        stats = stats_result.scalar_one_or_none()

        if stats is None:
            stats = CourseStats(course_id=course_id)
            db.add(stats)

        stats.total_runs = total_runs
        stats.unique_runners = unique_runners
        stats.avg_duration_seconds = avg_duration
        stats.avg_pace_seconds_per_km = avg_pace
        stats.best_duration_seconds = best_duration
        stats.best_pace_seconds_per_km = best_pace
        stats.completion_rate = completion_rate
        stats.runs_by_hour = runs_by_hour

        await db.flush()

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    def _get_date_filter(self, period: str, now: datetime) -> datetime | None:
        """Convert a period string to a start datetime filter."""
        if period == "week":
            return now - timedelta(days=7)
        elif period == "month":
            return now - timedelta(days=30)
        elif period == "year":
            return now - timedelta(days=365)
        return None

    async def _get_period_stats(
        self,
        db: AsyncSession,
        user_id: UUID,
        start: datetime,
        end: datetime,
    ) -> dict:
        """Get aggregate stats for a date range."""
        result = await db.execute(
            select(
                func.count(RunRecord.id).label("run_count"),
                func.coalesce(func.sum(RunRecord.distance_meters), 0).label("total_distance"),
                func.coalesce(func.sum(RunRecord.duration_seconds), 0).label("total_duration"),
            ).where(
                RunRecord.user_id == user_id,
                RunRecord.finished_at >= start,
                RunRecord.finished_at < end,
            )
        )
        row = result.one()
        return {
            "run_count": row.run_count or 0,
            "total_distance": row.total_distance or 0,
            "total_duration": row.total_duration or 0,
        }

    async def _calculate_streaks(self, db: AsyncSession, user_id: UUID) -> tuple[int, int]:
        """Calculate current and best running streaks (consecutive days)."""
        result = await db.execute(
            select(func.date(RunRecord.finished_at).label("run_date"))
            .where(RunRecord.user_id == user_id)
            .group_by(func.date(RunRecord.finished_at))
            .order_by(func.date(RunRecord.finished_at).desc())
        )
        dates = [row.run_date for row in result.all()]

        if not dates:
            return 0, 0

        today = datetime.now(timezone.utc).date()
        current_streak = 0
        best_streak = 0
        streak = 0

        for i, run_date in enumerate(dates):
            if i == 0:
                days_since = (today - run_date).days
                if days_since <= 1:
                    streak = 1
                    current_streak = 1
                else:
                    streak = 1
            else:
                prev_date = dates[i - 1]
                diff = (prev_date - run_date).days
                if diff == 1:
                    streak += 1
                else:
                    best_streak = max(best_streak, streak)
                    streak = 1

            if i == 0 or (i > 0 and (dates[i - 1] - run_date).days == 1):
                if current_streak > 0 or i == 0:
                    current_streak = streak

        best_streak = max(best_streak, streak)

        return current_streak, best_streak

    async def _get_monthly_distance(
        self,
        db: AsyncSession,
        user_id: UUID,
        months: int = 6,
    ) -> list[dict]:
        """Get monthly distance totals for the last N months."""
        now = datetime.now(timezone.utc)
        start_date = now - timedelta(days=months * 30)

        month_expr = func.to_char(RunRecord.finished_at, literal_column("'YYYY-MM'"))
        result = await db.execute(
            select(
                month_expr.label("month"),
                func.sum(RunRecord.distance_meters).label("distance"),
                func.count(RunRecord.id).label("run_count"),
            )
            .where(
                RunRecord.user_id == user_id,
                RunRecord.finished_at >= start_date,
            )
            .group_by(month_expr)
            .order_by(month_expr)
        )

        return [
            {
                "month": row.month,
                "distance_meters": int(row.distance or 0),
                "run_count": row.run_count or 0,
            }
            for row in result.all()
        ]
