"""Group run service: create, invite, accept, leave, manage group runs."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.models.course import Course
from app.models.group_ranking import GroupRanking
from app.models.group_run import GroupRun, GroupRunMember
from app.models.user import User


class GroupRunService:
    """Handles group run lifecycle and membership."""

    MAX_MEMBERS = 5

    async def create_group_run(
        self,
        db: AsyncSession,
        course_id: UUID,
        name: str,
        creator_id: UUID,
        invite_user_ids: list[UUID],
    ) -> dict:
        # Validate course exists
        course = await db.get(Course, course_id)
        if course is None:
            raise NotFoundError(code="COURSE_NOT_FOUND", message="코스를 찾을 수 없습니다")

        total_members = 1 + len(invite_user_ids)
        if total_members < 2 or total_members > self.MAX_MEMBERS:
            raise BadRequestError(
                code="INVALID_MEMBER_COUNT",
                message=f"그룹런은 2~{self.MAX_MEMBERS}명이어야 합니다",
            )

        # Ensure creator is not in invite list
        invite_user_ids = [uid for uid in invite_user_ids if uid != creator_id]
        if len(invite_user_ids) == 0:
            raise BadRequestError(
                code="INVALID_MEMBER_COUNT",
                message="본인 외에 최소 1명을 초대해야 합니다",
            )

        # Validate invited users exist
        users_result = await db.execute(
            select(User.id).where(User.id.in_(invite_user_ids))
        )
        found_ids = {row[0] for row in users_result.all()}
        missing = set(invite_user_ids) - found_ids
        if missing:
            raise NotFoundError(code="USER_NOT_FOUND", message="초대한 유저를 찾을 수 없습니다")

        group_run = GroupRun(
            course_id=course_id,
            name=name,
            creator_id=creator_id,
            status="active",
            member_count=1 + len(invite_user_ids),
        )
        db.add(group_run)
        await db.flush()

        # Add creator as accepted member
        creator_member = GroupRunMember(
            group_run_id=group_run.id,
            user_id=creator_id,
            status="accepted",
        )
        db.add(creator_member)

        # Add invited members
        for uid in invite_user_ids:
            member = GroupRunMember(
                group_run_id=group_run.id,
                user_id=uid,
                status="invited",
            )
            db.add(member)

        await db.flush()
        await db.refresh(group_run)

        return await self._group_run_to_dict(db, group_run, creator_id)

    async def accept_invite(
        self,
        db: AsyncSession,
        group_run_id: UUID,
        user_id: UUID,
    ) -> dict:
        group_run = await self._get_group_run_or_404(db, group_run_id)
        member = await self._get_member(db, group_run_id, user_id)
        if member is None:
            raise NotFoundError(code="NOT_INVITED", message="초대받지 않은 그룹입니다")
        if member.status != "invited":
            raise BadRequestError(code="ALREADY_ACCEPTED", message="이미 수락한 초대입니다")

        member.status = "accepted"
        await db.flush()

        return await self._group_run_to_dict(db, group_run, user_id)

    async def decline_invite(
        self,
        db: AsyncSession,
        group_run_id: UUID,
        user_id: UUID,
    ) -> None:
        group_run = await self._get_group_run_or_404(db, group_run_id)
        member = await self._get_member(db, group_run_id, user_id)
        if member is None:
            raise NotFoundError(code="NOT_INVITED", message="초대받지 않은 그룹입니다")

        await db.delete(member)
        group_run.member_count = max(0, group_run.member_count - 1)
        await db.flush()

    async def leave_group(
        self,
        db: AsyncSession,
        group_run_id: UUID,
        user_id: UUID,
    ) -> None:
        group_run = await self._get_group_run_or_404(db, group_run_id)
        member = await self._get_member(db, group_run_id, user_id)
        if member is None:
            raise NotFoundError(code="NOT_MEMBER", message="그룹 멤버가 아닙니다")

        await db.delete(member)
        group_run.member_count = max(0, group_run.member_count - 1)

        # Transfer creator if the leaving user is the creator
        if group_run.creator_id == user_id:
            remaining = await db.execute(
                select(GroupRunMember)
                .where(
                    GroupRunMember.group_run_id == group_run_id,
                    GroupRunMember.user_id != user_id,
                    GroupRunMember.status.in_(["accepted", "completed"]),
                )
                .order_by(GroupRunMember.joined_at)
                .limit(1)
            )
            next_member = remaining.scalar_one_or_none()
            if next_member:
                group_run.creator_id = next_member.user_id
            else:
                group_run.status = "completed"

        await db.flush()

        # Recalculate group ranking if member had completed
        if member.status == "completed":
            from app.services.group_ranking_service import GroupRankingService

            ranking_service = GroupRankingService()
            await ranking_service.update_group_ranking(db, group_run_id)
            await ranking_service.recalculate_group_ranks(db, group_run.course_id)

    async def invite_members(
        self,
        db: AsyncSession,
        group_run_id: UUID,
        user_id: UUID,
        invite_user_ids: list[UUID],
    ) -> dict:
        group_run = await self._get_group_run_or_404(db, group_run_id)

        if group_run.creator_id != user_id:
            raise PermissionDeniedError(code="NOT_CREATOR", message="그룹 생성자만 초대할 수 있습니다")

        if group_run.status != "active":
            raise BadRequestError(code="GROUP_NOT_ACTIVE", message="활성 상태의 그룹이 아닙니다")

        # Check capacity
        new_total = group_run.member_count + len(invite_user_ids)
        if new_total > self.MAX_MEMBERS:
            raise BadRequestError(
                code="MEMBER_LIMIT",
                message=f"그룹은 최대 {self.MAX_MEMBERS}명입니다",
            )

        # Check already members
        existing = await db.execute(
            select(GroupRunMember.user_id).where(
                GroupRunMember.group_run_id == group_run_id,
                GroupRunMember.user_id.in_(invite_user_ids),
            )
        )
        existing_ids = {row[0] for row in existing.all()}
        new_ids = [uid for uid in invite_user_ids if uid not in existing_ids]

        if not new_ids:
            raise ConflictError(code="ALREADY_MEMBERS", message="이미 그룹에 속한 유저입니다")

        for uid in new_ids:
            member = GroupRunMember(
                group_run_id=group_run_id,
                user_id=uid,
                status="invited",
            )
            db.add(member)

        group_run.member_count += len(new_ids)
        await db.flush()

        return await self._group_run_to_dict(db, group_run, user_id)

    async def disband_group(
        self,
        db: AsyncSession,
        group_run_id: UUID,
        user_id: UUID,
    ) -> None:
        group_run = await self._get_group_run_or_404(db, group_run_id)

        if group_run.creator_id != user_id:
            raise PermissionDeniedError(code="NOT_CREATOR", message="그룹 생성자만 해산할 수 있습니다")

        # Delete group ranking first
        ranking_result = await db.execute(
            select(GroupRanking).where(GroupRanking.group_run_id == group_run_id)
        )
        ranking = ranking_result.scalar_one_or_none()
        if ranking:
            course_id = ranking.course_id
            await db.delete(ranking)

        await db.delete(group_run)
        await db.flush()

        # Recalculate ranks for the course
        if ranking:
            from app.services.group_ranking_service import GroupRankingService

            await GroupRankingService().recalculate_group_ranks(db, course_id)

    async def get_group_run(
        self,
        db: AsyncSession,
        group_run_id: UUID,
        requesting_user_id: UUID | None = None,
    ) -> dict:
        group_run = await self._get_group_run_or_404(db, group_run_id)
        return await self._group_run_to_dict(db, group_run, requesting_user_id)

    async def get_my_group_runs(
        self,
        db: AsyncSession,
        user_id: UUID,
        course_id: UUID | None = None,
    ) -> list[dict]:
        query = (
            select(GroupRun)
            .join(GroupRunMember, GroupRunMember.group_run_id == GroupRun.id)
            .where(
                GroupRunMember.user_id == user_id,
                GroupRunMember.status.in_(["accepted", "completed"]),
                GroupRun.status == "active",
            )
            .options(joinedload(GroupRun.creator))
            .order_by(GroupRun.created_at.desc())
        )
        if course_id:
            query = query.where(GroupRun.course_id == course_id)

        result = await db.execute(query)
        group_runs = result.scalars().unique().all()

        return [
            await self._group_run_to_dict(db, gr, user_id) for gr in group_runs
        ]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_group_run_or_404(self, db: AsyncSession, group_run_id: UUID) -> GroupRun:
        result = await db.execute(
            select(GroupRun)
            .where(GroupRun.id == group_run_id)
            .options(joinedload(GroupRun.creator))
        )
        group_run = result.scalar_one_or_none()
        if group_run is None:
            raise NotFoundError(code="GROUP_RUN_NOT_FOUND", message="그룹런을 찾을 수 없습니다")
        return group_run

    async def _get_member(
        self, db: AsyncSession, group_run_id: UUID, user_id: UUID
    ) -> GroupRunMember | None:
        result = await db.execute(
            select(GroupRunMember).where(
                GroupRunMember.group_run_id == group_run_id,
                GroupRunMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def _group_run_to_dict(
        self,
        db: AsyncSession,
        group_run: GroupRun,
        requesting_user_id: UUID | None,
    ) -> dict:
        # Get members
        members_result = await db.execute(
            select(GroupRunMember)
            .where(GroupRunMember.group_run_id == group_run.id)
            .options(joinedload(GroupRunMember.user))
            .order_by(GroupRunMember.joined_at)
        )
        members = members_result.scalars().unique().all()

        # Get course name
        course = await db.get(Course, group_run.course_id)
        course_name = course.title if course else None

        # Get group ranking
        ranking_result = await db.execute(
            select(GroupRanking).where(GroupRanking.group_run_id == group_run.id)
        )
        ranking = ranking_result.scalar_one_or_none()

        my_status = None
        member_list = []
        for m in members:
            if requesting_user_id and m.user_id == requesting_user_id:
                my_status = m.status
            member_list.append({
                "user_id": str(m.user_id),
                "nickname": m.user.nickname if m.user else None,
                "avatar_url": m.user.avatar_url if m.user else None,
                "status": m.status,
                "best_duration_seconds": m.best_duration_seconds,
                "best_pace_seconds_per_km": m.best_pace_seconds_per_km,
            })

        return {
            "id": str(group_run.id),
            "course_id": str(group_run.course_id),
            "course_name": course_name,
            "name": group_run.name,
            "creator_id": str(group_run.creator_id) if group_run.creator_id else None,
            "status": group_run.status,
            "member_count": group_run.member_count,
            "members": member_list,
            "my_status": my_status,
            "group_ranking": {
                "rank": ranking.rank,
                "avg_duration_seconds": ranking.avg_duration_seconds,
            } if ranking else None,
            "created_at": group_run.created_at,
        }
