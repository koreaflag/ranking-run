"""Crew service: CRUD, membership, role management."""

from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crew_level_config import get_max_members, is_feature_unlocked
from app.core.exceptions import (
    BadRequestError,
    NotFoundError,
    PermissionDeniedError,
)
from app.models.crew import Crew, CrewMember
from app.models.crew_join_request import CrewJoinRequest


class CrewService:
    """Handles crew lifecycle and membership."""

    # ------------------------------------------------------------------
    # Crew CRUD
    # ------------------------------------------------------------------

    MAX_CREWS_PER_USER = 5
    CREW_CREATION_COST = 500

    async def create_crew(
        self,
        db: AsyncSession,
        user_id: UUID,
        data: dict,
    ) -> dict:
        # Check crew creation limit
        owned_count_result = await db.execute(
            select(func.count()).select_from(Crew).where(Crew.owner_id == user_id)
        )
        owned_count = owned_count_result.scalar() or 0
        if owned_count >= self.MAX_CREWS_PER_USER:
            raise BadRequestError(
                code="CREW_LIMIT_REACHED",
                message=f"크루는 최대 {self.MAX_CREWS_PER_USER}개까지 만들 수 있습니다",
            )

        # Check points requirement
        from app.models.user import User

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one()
        if user.total_points < self.CREW_CREATION_COST:
            raise BadRequestError(
                code="INSUFFICIENT_POINTS",
                message=f"크루 생성에 {self.CREW_CREATION_COST} 포인트가 필요합니다 (현재: {user.total_points}P)",
            )

        crew = Crew(
            name=data["name"],
            description=data.get("description"),
            logo_url=data.get("logo_url"),
            region=data.get("region"),
            owner_id=user_id,
            max_members=data.get("max_members"),
            is_public=data.get("is_public", True),
            badge_color=data.get("badge_color", "#FF7A33"),
            badge_icon=data.get("badge_icon", "people"),
            recurring_schedule=data.get("recurring_schedule"),
            meeting_point=data.get("meeting_point"),
            requires_approval=data.get("requires_approval", False),
            member_count=1,
        )
        db.add(crew)
        await db.flush()
        await db.refresh(crew)

        # Owner is auto-added as member with 'owner' role
        member = CrewMember(
            crew_id=crew.id,
            user_id=user_id,
            role="owner",
            grade_level=5,
        )
        db.add(member)
        await db.flush()

        # Deduct points, record transaction, and set crew_name on owner
        from app.models.point_transaction import PointTransaction

        user.total_points -= self.CREW_CREATION_COST
        tx = PointTransaction(
            user_id=user_id,
            amount=-self.CREW_CREATION_COST,
            balance_after=user.total_points,
            tx_type="crew_create",
            reference_id=crew.id,
        )
        db.add(tx)
        if not user.crew_name:
            user.crew_name = crew.name
        await db.flush()

        return self._crew_to_dict(crew, is_member=True, my_role="owner")

    async def get_crew(
        self,
        db: AsyncSession,
        crew_id: UUID,
        current_user_id: UUID | None = None,
    ) -> dict:
        result = await db.execute(
            select(Crew).where(Crew.id == crew_id)
        )
        crew = result.scalar_one_or_none()
        if crew is None:
            raise NotFoundError(code="NOT_FOUND", message="크루를 찾을 수 없습니다")

        is_member = False
        my_role = None
        join_request_status = None
        if current_user_id:
            member = await self._get_membership(db, crew_id, current_user_id)
            if member:
                is_member = True
                my_role = member.role
            elif crew.requires_approval:
                jr_result = await db.execute(
                    select(CrewJoinRequest.status).where(
                        CrewJoinRequest.crew_id == crew_id,
                        CrewJoinRequest.user_id == current_user_id,
                        CrewJoinRequest.status == "pending",
                    )
                )
                jr_status = jr_result.scalar_one_or_none()
                if jr_status:
                    join_request_status = jr_status

        return self._crew_to_dict(
            crew,
            is_member=is_member,
            my_role=my_role,
            join_request_status=join_request_status,
        )

    async def update_crew(
        self,
        db: AsyncSession,
        crew_id: UUID,
        user_id: UUID,
        data: dict,
    ) -> dict:
        crew = await self._get_crew_or_404(db, crew_id)
        member = await self._get_membership(db, crew_id, user_id)
        if not member or member.role not in ("owner", "admin"):
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="크루 관리 권한이 없습니다",
            )

        # Level gating for premium features
        if "badge_color" in data and data.get("badge_color") != crew.badge_color:
            if not is_feature_unlocked(crew.level, "badge_color"):
                raise PermissionDeniedError(
                    code="LEVEL_REQUIRED",
                    message="배지 색상 커스텀은 Lv.3 이상에서 가능합니다",
                )
        if "cover_image_url" in data and data.get("cover_image_url") != crew.cover_image_url:
            if not is_feature_unlocked(crew.level, "cover_image"):
                raise PermissionDeniedError(
                    code="LEVEL_REQUIRED",
                    message="커버 이미지는 Lv.3 이상에서 가능합니다",
                )
        if "grade_config" in data and data.get("grade_config") != crew.grade_config:
            if not is_feature_unlocked(crew.level, "grade_name_custom"):
                raise PermissionDeniedError(
                    code="LEVEL_REQUIRED",
                    message="등급 이름 커스텀은 Lv.4 이상에서 가능합니다",
                )

        for field in (
            "name", "description", "logo_url", "cover_image_url",
            "region", "max_members",
            "is_public", "badge_color", "badge_icon",
            "recurring_schedule", "meeting_point", "requires_approval",
            "grade_config",
        ):
            if field in data and data[field] is not None:
                setattr(crew, field, data[field])

        await db.flush()
        await db.refresh(crew)
        return self._crew_to_dict(crew, is_member=True, my_role=member.role)

    async def delete_crew(
        self,
        db: AsyncSession,
        crew_id: UUID,
        user_id: UUID,
    ) -> None:
        crew = await self._get_crew_or_404(db, crew_id)
        if crew.owner_id != user_id:
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="크루 소유자만 삭제할 수 있습니다",
            )
        await db.delete(crew)
        await db.flush()

    async def list_crews(
        self,
        db: AsyncSession,
        current_user_id: UUID | None = None,
        search: str | None = None,
        region: str | None = None,
        page: int = 0,
        per_page: int = 20,
    ) -> tuple[list[dict], int]:
        filters = [Crew.is_public.is_(True)]
        if search:
            filters.append(Crew.name.ilike(f"%{search}%"))
        if region:
            filters.append(Crew.region.ilike(f"%{region}%"))

        count_result = await db.execute(
            select(func.count(Crew.id)).where(*filters)
        )
        total_count = count_result.scalar_one()

        result = await db.execute(
            select(Crew)
            .where(*filters)
            .order_by(Crew.member_count.desc(), Crew.created_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )
        crews = result.scalars().all()

        # Batch check membership
        crew_ids = [c.id for c in crews]
        member_map = await self._batch_membership(db, crew_ids, current_user_id)

        # Batch check pending join requests for non-member crews
        jr_map: dict[UUID, str] = {}
        non_member_ids = [cid for cid in crew_ids if cid not in member_map]
        if non_member_ids and current_user_id:
            jr_result = await db.execute(
                select(CrewJoinRequest.crew_id, CrewJoinRequest.status).where(
                    CrewJoinRequest.crew_id.in_(non_member_ids),
                    CrewJoinRequest.user_id == current_user_id,
                    CrewJoinRequest.status == "pending",
                )
            )
            jr_map = {row[0]: row[1] for row in jr_result.all()}

        return [
            self._crew_to_dict(
                c,
                is_member=c.id in member_map,
                my_role=member_map.get(c.id),
                join_request_status=jr_map.get(c.id),
            )
            for c in crews
        ], total_count

    async def list_my_crews(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> list[dict]:
        result = await db.execute(
            select(CrewMember)
            .where(CrewMember.user_id == user_id)
            .order_by(CrewMember.joined_at.desc())
        )
        memberships = result.scalars().all()

        if not memberships:
            return []

        crew_ids = [m.crew_id for m in memberships]
        role_map = {m.crew_id: m.role for m in memberships}

        crews_result = await db.execute(
            select(Crew).where(Crew.id.in_(crew_ids))
        )
        crews = crews_result.scalars().all()
        crew_map = {c.id: c for c in crews}

        return [
            self._crew_to_dict(
                crew_map[cid],
                is_member=True,
                my_role=role_map[cid],
            )
            for cid in crew_ids
            if cid in crew_map
        ]

    # ------------------------------------------------------------------
    # Membership
    # ------------------------------------------------------------------

    async def join_crew(
        self,
        db: AsyncSession,
        crew_id: UUID,
        user_id: UUID,
    ) -> dict:
        crew = await self._get_crew_or_404(db, crew_id)

        existing = await self._get_membership(db, crew_id, user_id)
        if existing:
            raise BadRequestError(
                code="ALREADY_MEMBER", message="이미 크루 멤버입니다"
            )

        level_max = get_max_members(crew.level)
        effective_max = level_max
        if crew.max_members and level_max:
            effective_max = min(crew.max_members, level_max)
        elif crew.max_members:
            effective_max = crew.max_members
        if effective_max is not None and crew.member_count >= effective_max:
            raise BadRequestError(
                code="CREW_FULL",
                message=f"크루 정원이 가득 찼습니다 (Lv.{crew.level}: 최대 {effective_max}명)",
            )

        member = CrewMember(
            crew_id=crew_id,
            user_id=user_id,
            role="member",
            grade_level=1,
        )
        db.add(member)
        crew.member_count = Crew.member_count + 1
        crew.last_activity_at = func.now()
        await db.flush()
        await db.refresh(crew)

        # Set crew_name if user has none
        from app.models.user import User

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is not None and not user.crew_name:
            user.crew_name = crew.name
            await db.flush()

        return self._crew_to_dict(crew, is_member=True, my_role="member")

    async def invite_by_code(
        self,
        db: AsyncSession,
        crew_id: UUID,
        user_code: str,
        actor_user_id: UUID,
    ) -> dict:
        """Invite a user to crew by their unique user_code."""
        from app.models.user import User

        crew = await self._get_crew_or_404(db, crew_id)

        # Only owner/admin can invite
        actor = await self._get_membership(db, crew_id, actor_user_id)
        if not actor or actor.role not in ("owner", "admin"):
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="크루 관리 권한이 없습니다",
            )

        # Find target user
        result = await db.execute(
            select(User).where(User.user_code == user_code)
        )
        target_user = result.scalar_one_or_none()
        if target_user is None:
            raise NotFoundError(
                code="NOT_FOUND", message="해당 코드의 사용자를 찾을 수 없습니다"
            )

        # Check if already member
        existing = await self._get_membership(db, crew_id, target_user.id)
        if existing:
            raise BadRequestError(
                code="ALREADY_MEMBER", message="이미 크루 멤버입니다"
            )

        level_max = get_max_members(crew.level)
        effective_max = level_max
        if crew.max_members and level_max:
            effective_max = min(crew.max_members, level_max)
        elif crew.max_members:
            effective_max = crew.max_members
        if effective_max is not None and crew.member_count >= effective_max:
            raise BadRequestError(
                code="CREW_FULL",
                message=f"크루 정원이 가득 찼습니다 (Lv.{crew.level}: 최대 {effective_max}명)",
            )

        member = CrewMember(
            crew_id=crew_id,
            user_id=target_user.id,
            role="member",
            grade_level=1,
        )
        db.add(member)
        crew.member_count = Crew.member_count + 1
        await db.flush()
        await db.refresh(member)

        return self._member_to_dict(member)

    async def leave_crew(
        self,
        db: AsyncSession,
        crew_id: UUID,
        user_id: UUID,
    ) -> None:
        crew = await self._get_crew_or_404(db, crew_id)

        if crew.owner_id == user_id:
            raise BadRequestError(
                code="OWNER_CANNOT_LEAVE",
                message="크루 소유자는 탈퇴할 수 없습니다. 크루를 삭제하거나 소유자를 이전하세요.",
            )

        member = await self._get_membership(db, crew_id, user_id)
        if not member:
            raise BadRequestError(
                code="NOT_MEMBER", message="크루 멤버가 아닙니다"
            )

        await db.delete(member)
        crew.member_count = func.greatest(Crew.member_count - 1, 1)
        await db.flush()

        # Clear crew_name if it matches
        from app.models.user import User

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is not None and user.crew_name == crew.name:
            user.crew_name = None
            await db.flush()

    async def kick_member(
        self,
        db: AsyncSession,
        crew_id: UUID,
        target_user_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        crew = await self._get_crew_or_404(db, crew_id)
        actor = await self._get_membership(db, crew_id, actor_user_id)
        if not actor or actor.role not in ("owner", "admin"):
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="크루 관리 권한이 없습니다",
            )

        if target_user_id == crew.owner_id:
            raise BadRequestError(
                code="CANNOT_KICK_OWNER",
                message="크루 소유자는 강퇴할 수 없습니다",
            )

        target = await self._get_membership(db, crew_id, target_user_id)
        if not target:
            raise NotFoundError(code="NOT_FOUND", message="해당 멤버를 찾을 수 없습니다")

        # Admin cannot kick another admin
        if actor.role == "admin" and target.role == "admin":
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="동급 관리자는 강퇴할 수 없습니다",
            )

        await db.delete(target)
        crew.member_count = func.greatest(Crew.member_count - 1, 1)
        await db.flush()

        # Clear crew_name if it matches
        from app.models.user import User

        user_result = await db.execute(
            select(User).where(User.id == target_user_id)
        )
        user = user_result.scalar_one_or_none()
        if user is not None and user.crew_name == crew.name:
            user.crew_name = None
            await db.flush()

    async def update_member_role(
        self,
        db: AsyncSession,
        crew_id: UUID,
        target_user_id: UUID,
        actor_user_id: UUID,
        new_role: str,
    ) -> dict:
        crew = await self._get_crew_or_404(db, crew_id)

        if crew.owner_id != actor_user_id:
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="역할 변경은 크루 소유자만 가능합니다",
            )

        if target_user_id == actor_user_id:
            raise BadRequestError(
                code="CANNOT_CHANGE_OWN_ROLE",
                message="자신의 역할은 변경할 수 없습니다",
            )

        target = await self._get_membership(db, crew_id, target_user_id)
        if not target:
            raise NotFoundError(code="NOT_FOUND", message="해당 멤버를 찾을 수 없습니다")

        target.role = new_role
        if new_role == "admin":
            target.grade_level = 4
        elif new_role == "member":
            target.grade_level = 1
        await db.flush()
        await db.refresh(target)

        return self._member_to_dict(target)

    async def get_members(
        self,
        db: AsyncSession,
        crew_id: UUID,
        page: int = 0,
        per_page: int = 50,
    ) -> tuple[list[dict], int]:
        await self._get_crew_or_404(db, crew_id)

        count_result = await db.execute(
            select(func.count(CrewMember.id)).where(
                CrewMember.crew_id == crew_id
            )
        )
        total_count = count_result.scalar_one()

        result = await db.execute(
            select(CrewMember)
            .where(CrewMember.crew_id == crew_id)
            .order_by(CrewMember.grade_level.desc(), CrewMember.joined_at.asc())
            .offset(page * per_page)
            .limit(per_page)
        )
        members = result.scalars().all()

        return [self._member_to_dict(m) for m in members], total_count

    async def set_primary_crew(
        self,
        db: AsyncSession,
        user_id: UUID,
        crew_id: UUID,
    ) -> str:
        """Set the user's primary crew (displayed crew_name on profile)."""
        from app.models.user import User

        member = await self._get_membership(db, crew_id, user_id)
        if not member:
            raise BadRequestError(
                code="NOT_MEMBER", message="크루 멤버가 아닙니다"
            )

        crew = await self._get_crew_or_404(db, crew_id)

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is not None:
            user.crew_name = crew.name
            await db.flush()

        return crew.name

    # ------------------------------------------------------------------
    # Grade management
    # ------------------------------------------------------------------

    async def update_member_grade(
        self,
        db: AsyncSession,
        crew_id: UUID,
        target_user_id: UUID,
        actor_user_id: UUID,
        new_grade_level: int,
    ) -> dict:
        await self._get_crew_or_404(db, crew_id)
        actor = await self._get_membership(db, crew_id, actor_user_id)
        if not actor:
            raise PermissionDeniedError(
                code="PERMISSION_DENIED", message="크루 멤버가 아닙니다"
            )

        if actor.grade_level <= new_grade_level:
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="자기보다 높은 등급으로 변경할 수 없습니다",
            )

        if target_user_id == actor_user_id:
            raise BadRequestError(
                code="CANNOT_CHANGE_OWN_GRADE",
                message="자신의 등급은 변경할 수 없습니다",
            )

        target = await self._get_membership(db, crew_id, target_user_id)
        if not target:
            raise NotFoundError(
                code="NOT_FOUND", message="해당 멤버를 찾을 수 없습니다"
            )

        if actor.grade_level <= target.grade_level:
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="동급 이상의 멤버는 변경할 수 없습니다",
            )

        target.grade_level = new_grade_level
        # Sync role for backward compatibility
        if new_grade_level >= 4:
            target.role = "admin"
        else:
            target.role = "member"

        await db.flush()
        await db.refresh(target)
        return self._member_to_dict(target)

    async def get_management_stats(
        self,
        db: AsyncSession,
        crew_id: UUID,
        user_id: UUID,
    ) -> dict:
        member = await self._get_membership(db, crew_id, user_id)
        if not member or member.role not in ("owner", "admin"):
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="크루 관리 권한이 없습니다",
            )

        crew = await self._get_crew_or_404(db, crew_id)

        # Members by grade
        grade_result = await db.execute(
            select(CrewMember.grade_level, func.count())
            .where(CrewMember.crew_id == crew_id)
            .group_by(CrewMember.grade_level)
        )
        members_by_grade = {row[0]: row[1] for row in grade_result.all()}

        # Pending requests
        pending_result = await db.execute(
            select(func.count())
            .select_from(CrewJoinRequest)
            .where(
                CrewJoinRequest.crew_id == crew_id,
                CrewJoinRequest.status == "pending",
            )
        )
        pending_count = pending_result.scalar() or 0

        # Recent joins (7 days)
        from datetime import datetime, timedelta, timezone

        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

        joins_result = await db.execute(
            select(func.count())
            .select_from(CrewMember)
            .where(
                CrewMember.crew_id == crew_id,
                CrewMember.joined_at >= seven_days_ago,
            )
        )
        recent_joins = joins_result.scalar() or 0

        return {
            "total_members": crew.member_count,
            "members_by_grade": members_by_grade,
            "pending_requests": pending_count,
            "recent_joins_7d": recent_joins,
            "recent_leaves_7d": 0,  # Would need tracking table for leaves
        }

    async def get_weekly_ranking(
        self,
        db: AsyncSession,
        crew_id: UUID,
    ) -> list[dict]:
        """Get this week's distance ranking for crew members."""
        from datetime import datetime, timedelta, timezone

        from sqlalchemy import and_, desc

        from app.models.run_record import RunRecord
        from app.models.user import User

        # Monday of this week (00:00 UTC)
        now = datetime.now(timezone.utc)
        monday = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0,
        )

        result = await db.execute(
            select(
                CrewMember.user_id,
                User.nickname,
                User.avatar_url,
                func.coalesce(func.sum(RunRecord.distance_meters), 0).label("weekly_distance"),
                func.count(RunRecord.id).label("weekly_runs"),
            )
            .select_from(CrewMember)
            .join(User, User.id == CrewMember.user_id)
            .outerjoin(
                RunRecord,
                and_(
                    RunRecord.user_id == CrewMember.user_id,
                    RunRecord.finished_at >= monday,
                ),
            )
            .where(CrewMember.crew_id == crew_id)
            .group_by(CrewMember.user_id, User.nickname, User.avatar_url)
            .order_by(desc("weekly_distance"))
        )
        rows = result.all()

        return [
            {
                "user_id": str(row.user_id),
                "nickname": row.nickname,
                "avatar_url": row.avatar_url,
                "weekly_distance": row.weekly_distance,
                "weekly_runs": row.weekly_runs,
                "rank": i + 1,
            }
            for i, row in enumerate(rows)
        ]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_crew_or_404(self, db: AsyncSession, crew_id: UUID) -> Crew:
        result = await db.execute(select(Crew).where(Crew.id == crew_id))
        crew = result.scalar_one_or_none()
        if crew is None:
            raise NotFoundError(code="NOT_FOUND", message="크루를 찾을 수 없습니다")
        return crew

    async def _get_membership(
        self, db: AsyncSession, crew_id: UUID, user_id: UUID
    ) -> CrewMember | None:
        result = await db.execute(
            select(CrewMember).where(
                CrewMember.crew_id == crew_id,
                CrewMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def _batch_membership(
        self,
        db: AsyncSession,
        crew_ids: list[UUID],
        user_id: UUID | None,
    ) -> dict[UUID, str]:
        if not crew_ids or user_id is None:
            return {}
        result = await db.execute(
            select(CrewMember.crew_id, CrewMember.role).where(
                CrewMember.crew_id.in_(crew_ids),
                CrewMember.user_id == user_id,
            )
        )
        return {row[0]: row[1] for row in result.all()}

    @staticmethod
    def _crew_to_dict(
        crew: Crew,
        *,
        is_member: bool,
        my_role: str | None,
        join_request_status: str | None = None,
    ) -> dict:
        owner = crew.owner
        return {
            "id": str(crew.id),
            "name": crew.name,
            "description": crew.description,
            "logo_url": crew.logo_url,
            "cover_image_url": crew.cover_image_url,
            "region": crew.region,
            "owner": {
                "id": str(owner.id) if owner else "",
                "nickname": owner.nickname if owner else None,
                "avatar_url": owner.avatar_url if owner else None,
            },
            "member_count": crew.member_count,
            "max_members": crew.max_members,
            "is_public": crew.is_public,
            "badge_color": crew.badge_color,
            "badge_icon": crew.badge_icon,
            "recurring_schedule": crew.recurring_schedule,
            "meeting_point": crew.meeting_point,
            "requires_approval": crew.requires_approval,
            "level": crew.level,
            "total_xp": crew.total_xp,
            "grade_config": crew.grade_config,
            "is_member": is_member,
            "my_role": my_role,
            "join_request_status": join_request_status,
            "last_activity_at": crew.last_activity_at,
            "created_at": crew.created_at,
            "updated_at": crew.updated_at,
        }

    @staticmethod
    def _member_to_dict(member: CrewMember) -> dict:
        user = member.user
        return {
            "user_id": str(member.user_id),
            "nickname": user.nickname if user else None,
            "avatar_url": user.avatar_url if user else None,
            "role": member.role,
            "grade_level": member.grade_level,
            "joined_at": member.joined_at,
        }
