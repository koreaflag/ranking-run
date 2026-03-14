"""Stats service: user statistics, weekly summaries, and course stats recalculation."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, distinct, func, literal_column, or_, select
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
                RunRecord.is_flagged == False,
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
        course_id: UUID | None = None,
        run_record_id: UUID | None = None,
    ) -> User:
        """Update user's cumulative total_distance_meters, total_runs, and total_points."""
        from app.models.point_transaction import PointTransaction

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one()
        user.total_distance_meters += distance_meters
        user.total_runs += 1

        # Points: 10pt per km + 30pt bonus for course runs
        points = distance_meters // 100
        if course_id is not None:
            points += 30
        user.total_points += points

        # Record point transaction for audit trail
        if points > 0:
            tx = PointTransaction(
                user_id=user_id,
                amount=points,
                balance_after=user.total_points,
                tx_type="course_bonus" if course_id is not None else "run_earn",
                reference_id=run_record_id,
            )
            db.add(tx)

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

    async def get_weekly_leaderboard(
        self,
        db: AsyncSession,
        page: int = 0,
        per_page: int = 20,
        region: str | None = None,
        requesting_user_id: UUID | None = None,
    ) -> dict:
        """Get the weekly leaderboard ranked by course run count."""
        now = datetime.now(timezone.utc)
        week_start = now - timedelta(days=now.weekday())
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = week_start + timedelta(days=7)

        # Base subquery: aggregate course runs per user this week
        agg = (
            select(
                RunRecord.user_id,
                func.sum(RunRecord.distance_meters).label("total_distance"),
                func.count(RunRecord.id).label("run_count"),
                func.sum(RunRecord.duration_seconds).label("total_duration"),
            )
            .where(
                RunRecord.finished_at >= week_start,
                RunRecord.finished_at < week_end,
                RunRecord.course_id.isnot(None),
            )
            .group_by(RunRecord.user_id)
            .subquery()
        )

        # Join with user for profile info + optional region filter
        query = (
            select(
                agg.c.user_id,
                agg.c.total_distance,
                agg.c.run_count,
                agg.c.total_duration,
                User.nickname,
                User.avatar_url,
                User.crew_name,
            )
            .join(User, User.id == agg.c.user_id)
            .order_by(agg.c.run_count.desc(), agg.c.total_distance.desc())
        )

        if region:
            query = query.where(User.activity_region.ilike(f"%{region}%"))

        # Total count
        count_result = await db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginated data
        result = await db.execute(
            query.offset(page * per_page).limit(per_page)
        )
        rows = result.all()

        data = []
        for i, row in enumerate(rows):
            data.append({
                "rank": page * per_page + i + 1,
                "user": {
                    "id": str(row.user_id),
                    "nickname": row.nickname,
                    "avatar_url": row.avatar_url,
                    "crew_name": row.crew_name,
                },
                "total_distance_meters": int(row.total_distance or 0),
                "run_count": int(row.run_count or 0),
                "total_duration_seconds": int(row.total_duration or 0),
            })

        # My ranking
        my_ranking = None
        if requesting_user_id:
            my_ranking = await self._get_my_weekly_ranking(
                db, requesting_user_id, week_start, week_end, region
            )

        return {
            "data": data,
            "my_ranking": my_ranking,
            "period_start": week_start,
            "period_end": week_end,
            "total": total,
        }

    async def _get_my_weekly_ranking(
        self,
        db: AsyncSession,
        user_id: UUID,
        week_start: datetime,
        week_end: datetime,
        region: str | None = None,
    ) -> dict | None:
        """Get the requesting user's weekly ranking entry (course runs only)."""
        # My course-run stats this week
        my_result = await db.execute(
            select(
                func.sum(RunRecord.distance_meters).label("total_distance"),
                func.count(RunRecord.id).label("run_count"),
                func.sum(RunRecord.duration_seconds).label("total_duration"),
            ).where(
                RunRecord.user_id == user_id,
                RunRecord.finished_at >= week_start,
                RunRecord.finished_at < week_end,
                RunRecord.course_id.isnot(None),
            )
        )
        my_row = my_result.one()
        my_run_count = int(my_row.run_count or 0)
        my_total_distance = int(my_row.total_distance or 0)
        my_total_duration = int(my_row.total_duration or 0)

        if my_run_count == 0:
            return None

        # Count users ranked above me: more runs, or same runs but more distance
        agg = (
            select(
                RunRecord.user_id,
                func.sum(RunRecord.distance_meters).label("total_distance"),
                func.count(RunRecord.id).label("run_count"),
            )
            .where(
                RunRecord.finished_at >= week_start,
                RunRecord.finished_at < week_end,
                RunRecord.course_id.isnot(None),
            )
            .group_by(RunRecord.user_id)
            .subquery()
        )

        above_query = (
            select(func.count())
            .select_from(
                select(agg.c.user_id)
                .join(User, User.id == agg.c.user_id)
                .where(
                    or_(
                        agg.c.run_count > my_run_count,
                        and_(
                            agg.c.run_count == my_run_count,
                            agg.c.total_distance > my_total_distance,
                        ),
                    )
                )
            )
        )
        if region:
            above_query = (
                select(func.count())
                .select_from(
                    select(agg.c.user_id)
                    .join(User, User.id == agg.c.user_id)
                    .where(
                        or_(
                            agg.c.run_count > my_run_count,
                            and_(
                                agg.c.run_count == my_run_count,
                                agg.c.total_distance > my_total_distance,
                            ),
                        ),
                        User.activity_region.ilike(f"%{region}%"),
                    )
                )
            )

        rank_result = await db.execute(above_query)
        rank = (rank_result.scalar() or 0) + 1

        # Get user info
        user_result = await db.execute(
            select(User.nickname, User.avatar_url, User.crew_name, User.runner_level).where(User.id == user_id)
        )
        user_row = user_result.one_or_none()
        if not user_row:
            return None

        return {
            "rank": rank,
            "user": {
                "id": str(user_id),
                "nickname": user_row.nickname,
                "avatar_url": user_row.avatar_url,
                "crew_name": user_row.crew_name,
                "runner_level": user_row.runner_level,
            },
            "total_distance_meters": my_total_distance,
            "run_count": my_run_count,
            "total_duration_seconds": my_total_duration,
        }

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
        """Calculate current and best running streaks (consecutive days).

        Returns (current_streak, best_streak). Current streak is only counted
        if the most recent run was today or yesterday (i.e. the streak is still
        "alive").  Dates are evaluated in UTC.
        """
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
        best_streak = 0
        streak = 1  # The first date is always a streak of 1

        # Check if the most recent run is recent enough for a "current" streak
        days_since_last = (today - dates[0]).days
        is_current_alive = days_since_last <= 1

        for i in range(1, len(dates)):
            diff = (dates[i - 1] - dates[i]).days
            if diff == 1:
                streak += 1
            else:
                # Streak broken — record best before resetting
                best_streak = max(best_streak, streak)
                streak = 1

        best_streak = max(best_streak, streak)

        # Current streak is the streak that includes the most recent run date,
        # but only if the most recent run was today or yesterday.
        if is_current_alive:
            # Recount from the beginning (most recent date) until break
            current_streak = 1
            for i in range(1, len(dates)):
                diff = (dates[i - 1] - dates[i]).days
                if diff == 1:
                    current_streak += 1
                else:
                    break
        else:
            current_streak = 0

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
