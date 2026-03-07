"""Group ranking service: group leaderboard calculation and queries."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.group_ranking import GroupRanking
from app.models.group_run import GroupRun, GroupRunMember

logger = logging.getLogger(__name__)


class GroupRankingService:
    """Handles group ranking calculation and leaderboard queries."""

    MIN_COMPLETED_FOR_RANKING = 2

    async def update_member_best(
        self,
        db: AsyncSession,
        group_run_id: UUID,
        user_id: UUID,
        duration_seconds: int,
        pace_seconds_per_km: int,
    ) -> None:
        """Update a member's best time and recalculate group ranking."""
        result = await db.execute(
            select(GroupRunMember).where(
                GroupRunMember.group_run_id == group_run_id,
                GroupRunMember.user_id == user_id,
            )
        )
        member = result.scalar_one_or_none()
        if member is None:
            return

        # Only update if better than previous best
        if member.best_duration_seconds is None or duration_seconds < member.best_duration_seconds:
            member.best_duration_seconds = duration_seconds
            member.best_pace_seconds_per_km = pace_seconds_per_km
            member.completed_at = datetime.now(timezone.utc)

        if member.status in ("invited", "accepted"):
            member.status = "completed"

        await db.flush()

        # Recalculate group ranking
        group_run = await db.get(GroupRun, group_run_id)
        if group_run:
            await self.update_group_ranking(db, group_run_id)
            await self.recalculate_group_ranks(db, group_run.course_id)

    async def update_group_ranking(
        self,
        db: AsyncSession,
        group_run_id: UUID,
    ) -> None:
        """Recalculate and upsert group ranking based on completed members."""
        group_run = await db.get(GroupRun, group_run_id)
        if group_run is None:
            return

        # Get completed members
        result = await db.execute(
            select(GroupRunMember).where(
                GroupRunMember.group_run_id == group_run_id,
                GroupRunMember.status == "completed",
                GroupRunMember.best_duration_seconds.is_not(None),
            )
        )
        completed_members = result.scalars().all()

        completed_count = len(completed_members)

        # Get or create ranking entry
        ranking_result = await db.execute(
            select(GroupRanking).where(GroupRanking.group_run_id == group_run_id)
        )
        ranking = ranking_result.scalar_one_or_none()

        if completed_count < self.MIN_COMPLETED_FOR_RANKING:
            # Remove ranking if exists but not enough members
            if ranking:
                await db.delete(ranking)
                await db.flush()
            return

        # Calculate average duration
        total_duration = sum(m.best_duration_seconds for m in completed_members)
        avg_duration = total_duration // completed_count

        # Count total members (all statuses)
        total_result = await db.execute(
            select(func.count(GroupRunMember.id)).where(
                GroupRunMember.group_run_id == group_run_id
            )
        )
        total_members = total_result.scalar() or 0

        now = datetime.now(timezone.utc)

        if ranking:
            ranking.avg_duration_seconds = avg_duration
            ranking.completed_count = completed_count
            ranking.total_members = total_members
            ranking.group_name = group_run.name
            ranking.updated_at = now
            if avg_duration < ranking.avg_duration_seconds or ranking.achieved_at is None:
                ranking.achieved_at = now
        else:
            ranking = GroupRanking(
                course_id=group_run.course_id,
                group_run_id=group_run_id,
                group_name=group_run.name,
                avg_duration_seconds=avg_duration,
                completed_count=completed_count,
                total_members=total_members,
                achieved_at=now,
                updated_at=now,
            )
            db.add(ranking)

        await db.flush()

    async def recalculate_group_ranks(
        self,
        db: AsyncSession,
        course_id: UUID,
    ) -> None:
        """Recalculate cached rank values for all group rankings on a course."""
        result = await db.execute(
            select(GroupRanking)
            .where(GroupRanking.course_id == course_id)
            .order_by(GroupRanking.avg_duration_seconds)
        )
        rankings = result.scalars().all()

        for i, ranking in enumerate(rankings):
            ranking.rank = i + 1

        await db.flush()

    async def get_course_group_rankings(
        self,
        db: AsyncSession,
        course_id: UUID,
        page: int = 0,
        per_page: int = 20,
        requesting_user_id: UUID | None = None,
    ) -> dict:
        """Get paginated group ranking leaderboard for a course."""
        total_result = await db.execute(
            select(func.count(GroupRanking.id)).where(
                GroupRanking.course_id == course_id
            )
        )
        total_groups = total_result.scalar() or 0

        result = await db.execute(
            select(GroupRanking)
            .where(GroupRanking.course_id == course_id)
            .options(joinedload(GroupRanking.group_run))
            .order_by(GroupRanking.avg_duration_seconds)
            .offset(page * per_page)
            .limit(per_page)
        )
        rankings = result.scalars().unique().all()

        data = []
        for i, ranking in enumerate(rankings):
            rank = ranking.rank if ranking.rank else page * per_page + i + 1
            members = await self._get_group_members_preview(db, ranking.group_run_id)
            data.append({
                "rank": rank,
                "group_run_id": str(ranking.group_run_id),
                "group_name": ranking.group_name,
                "avg_duration_seconds": ranking.avg_duration_seconds,
                "completed_count": ranking.completed_count,
                "total_members": ranking.total_members,
                "members": members,
                "achieved_at": ranking.achieved_at,
            })

        # Get requesting user's groups
        my_groups = []
        if requesting_user_id:
            my_result = await db.execute(
                select(GroupRanking)
                .join(GroupRun, GroupRun.id == GroupRanking.group_run_id)
                .join(GroupRunMember, GroupRunMember.group_run_id == GroupRun.id)
                .where(
                    GroupRanking.course_id == course_id,
                    GroupRunMember.user_id == requesting_user_id,
                    GroupRunMember.status.in_(["accepted", "completed"]),
                )
                .options(joinedload(GroupRanking.group_run))
            )
            my_rankings = my_result.scalars().unique().all()

            for ranking in my_rankings:
                # Skip if already in main data
                if any(d["group_run_id"] == str(ranking.group_run_id) for d in data):
                    continue
                members = await self._get_group_members_preview(db, ranking.group_run_id)
                my_groups.append({
                    "rank": ranking.rank or 0,
                    "group_run_id": str(ranking.group_run_id),
                    "group_name": ranking.group_name,
                    "avg_duration_seconds": ranking.avg_duration_seconds,
                    "completed_count": ranking.completed_count,
                    "total_members": ranking.total_members,
                    "members": members,
                    "achieved_at": ranking.achieved_at,
                })

        return {
            "data": data,
            "my_groups": my_groups,
            "total_groups": total_groups,
        }

    async def _get_group_members_preview(
        self,
        db: AsyncSession,
        group_run_id: UUID,
        limit: int = 5,
    ) -> list[dict]:
        """Get a preview of group members for display."""
        result = await db.execute(
            select(GroupRunMember)
            .where(GroupRunMember.group_run_id == group_run_id)
            .options(joinedload(GroupRunMember.user))
            .order_by(
                # Completed first, then by best time
                GroupRunMember.status.desc(),
                GroupRunMember.best_duration_seconds.asc().nulls_last(),
            )
            .limit(limit)
        )
        members = result.scalars().unique().all()

        return [
            {
                "user_id": str(m.user_id),
                "nickname": m.user.nickname if m.user else None,
                "avatar_url": m.user.avatar_url if m.user else None,
                "status": m.status,
                "best_duration_seconds": m.best_duration_seconds,
                "best_pace_seconds_per_km": m.best_pace_seconds_per_km,
            }
            for m in members
        ]
