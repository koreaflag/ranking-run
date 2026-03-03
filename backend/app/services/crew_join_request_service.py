"""Crew join request service: create, approve, reject, cancel."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, NotFoundError, PermissionDeniedError
from app.models.crew import Crew, CrewMember
from app.models.crew_join_request import CrewJoinRequest


class CrewJoinRequestService:

    async def create_request(
        self,
        db: AsyncSession,
        crew_id: UUID,
        user_id: UUID,
        message: str | None = None,
    ) -> dict:
        # Check crew exists and requires approval
        crew = await self._get_crew_or_404(db, crew_id)
        if not crew.requires_approval:
            raise BadRequestError(
                code="NO_APPROVAL_NEEDED",
                message="이 크루는 승인 없이 가입 가능합니다",
            )

        # Check not already member
        existing_member = await db.execute(
            select(CrewMember).where(
                CrewMember.crew_id == crew_id,
                CrewMember.user_id == user_id,
            )
        )
        if existing_member.scalar_one_or_none():
            raise BadRequestError(
                code="ALREADY_MEMBER", message="이미 크루 멤버입니다"
            )

        # Check no pending request
        existing_req = await db.execute(
            select(CrewJoinRequest).where(
                CrewJoinRequest.crew_id == crew_id,
                CrewJoinRequest.user_id == user_id,
                CrewJoinRequest.status == "pending",
            )
        )
        if existing_req.scalar_one_or_none():
            raise BadRequestError(
                code="ALREADY_REQUESTED",
                message="이미 가입 신청이 진행 중입니다",
            )

        # Check crew capacity
        if crew.max_members and crew.member_count >= crew.max_members:
            raise BadRequestError(
                code="CREW_FULL", message="크루 정원이 가득 찼습니다"
            )

        req = CrewJoinRequest(
            crew_id=crew_id,
            user_id=user_id,
            message=message,
            status="pending",
        )
        db.add(req)
        await db.flush()
        await db.refresh(req)
        return self._to_dict(req)

    async def approve_request(
        self,
        db: AsyncSession,
        crew_id: UUID,
        request_id: UUID,
        reviewer_id: UUID,
    ) -> dict:
        req = await self._get_request_or_404(db, request_id)
        if req.crew_id != crew_id:
            raise NotFoundError(code="NOT_FOUND", message="신청을 찾을 수 없습니다")

        # Only owner/admin can approve
        await self._check_admin(db, crew_id, reviewer_id)

        if req.status != "pending":
            raise BadRequestError(
                code="INVALID_STATUS",
                message="처리 가능한 상태가 아닙니다",
            )

        crew = await self._get_crew_or_404(db, crew_id)
        if crew.max_members and crew.member_count >= crew.max_members:
            raise BadRequestError(
                code="CREW_FULL", message="크루 정원이 가득 찼습니다"
            )

        req.status = "approved"
        req.reviewed_by = reviewer_id
        req.reviewed_at = datetime.now(timezone.utc)

        # Add as member
        member = CrewMember(
            crew_id=crew_id,
            user_id=req.user_id,
            role="member",
        )
        db.add(member)
        crew.member_count = Crew.member_count + 1
        await db.flush()

        # Set crew_name if user has none
        from app.models.user import User
        user_result = await db.execute(select(User).where(User.id == req.user_id))
        user = user_result.scalar_one_or_none()
        if user and not user.crew_name:
            user.crew_name = crew.name
            await db.flush()

        await db.refresh(req)
        return self._to_dict(req)

    async def reject_request(
        self,
        db: AsyncSession,
        crew_id: UUID,
        request_id: UUID,
        reviewer_id: UUID,
    ) -> None:
        req = await self._get_request_or_404(db, request_id)
        if req.crew_id != crew_id:
            raise NotFoundError(code="NOT_FOUND", message="신청을 찾을 수 없습니다")

        await self._check_admin(db, crew_id, reviewer_id)

        if req.status != "pending":
            raise BadRequestError(
                code="INVALID_STATUS",
                message="처리 가능한 상태가 아닙니다",
            )

        req.status = "rejected"
        req.reviewed_by = reviewer_id
        req.reviewed_at = datetime.now(timezone.utc)
        await db.flush()

    async def cancel_request(
        self,
        db: AsyncSession,
        crew_id: UUID,
        request_id: UUID,
        user_id: UUID,
    ) -> None:
        req = await self._get_request_or_404(db, request_id)
        if req.crew_id != crew_id or req.user_id != user_id:
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="본인의 신청만 취소할 수 있습니다",
            )
        if req.status != "pending":
            raise BadRequestError(
                code="INVALID_STATUS",
                message="대기 중인 신청만 취소할 수 있습니다",
            )
        await db.delete(req)
        await db.flush()

    async def get_pending_requests(
        self,
        db: AsyncSession,
        crew_id: UUID,
        reviewer_id: UUID,
        page: int = 0,
        per_page: int = 20,
    ) -> tuple[list[dict], int]:
        await self._check_admin(db, crew_id, reviewer_id)

        count_result = await db.execute(
            select(func.count(CrewJoinRequest.id)).where(
                CrewJoinRequest.crew_id == crew_id,
                CrewJoinRequest.status == "pending",
            )
        )
        total = count_result.scalar_one()

        result = await db.execute(
            select(CrewJoinRequest)
            .where(
                CrewJoinRequest.crew_id == crew_id,
                CrewJoinRequest.status == "pending",
            )
            .order_by(CrewJoinRequest.created_at.asc())
            .offset(page * per_page)
            .limit(per_page)
        )
        requests = result.scalars().all()
        return [self._to_dict(r) for r in requests], total

    async def get_my_request(
        self,
        db: AsyncSession,
        crew_id: UUID,
        user_id: UUID,
    ) -> dict:
        result = await db.execute(
            select(CrewJoinRequest).where(
                CrewJoinRequest.crew_id == crew_id,
                CrewJoinRequest.user_id == user_id,
                CrewJoinRequest.status == "pending",
            )
        )
        req = result.scalar_one_or_none()
        if req:
            return {"status": req.status, "request_id": str(req.id)}
        return {"status": None, "request_id": None}

    async def get_pending_count(
        self,
        db: AsyncSession,
        crew_id: UUID,
    ) -> int:
        result = await db.execute(
            select(func.count(CrewJoinRequest.id)).where(
                CrewJoinRequest.crew_id == crew_id,
                CrewJoinRequest.status == "pending",
            )
        )
        return result.scalar_one()

    # --- Helpers ---

    async def _get_crew_or_404(self, db: AsyncSession, crew_id: UUID) -> Crew:
        result = await db.execute(select(Crew).where(Crew.id == crew_id))
        crew = result.scalar_one_or_none()
        if crew is None:
            raise NotFoundError(code="NOT_FOUND", message="크루를 찾을 수 없습니다")
        return crew

    async def _get_request_or_404(
        self, db: AsyncSession, request_id: UUID
    ) -> CrewJoinRequest:
        result = await db.execute(
            select(CrewJoinRequest).where(CrewJoinRequest.id == request_id)
        )
        req = result.scalar_one_or_none()
        if req is None:
            raise NotFoundError(code="NOT_FOUND", message="신청을 찾을 수 없습니다")
        return req

    async def _check_admin(
        self, db: AsyncSession, crew_id: UUID, user_id: UUID
    ) -> None:
        result = await db.execute(
            select(CrewMember).where(
                CrewMember.crew_id == crew_id,
                CrewMember.user_id == user_id,
            )
        )
        member = result.scalar_one_or_none()
        if not member or member.role not in ("owner", "admin"):
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="크루 관리 권한이 없습니다",
            )

    @staticmethod
    def _to_dict(req: CrewJoinRequest) -> dict:
        user = req.user
        return {
            "id": str(req.id),
            "user": {
                "id": str(user.id) if user else "",
                "nickname": user.nickname if user else None,
                "avatar_url": user.avatar_url if user else None,
            },
            "message": req.message,
            "status": req.status,
            "created_at": req.created_at,
            "reviewed_at": req.reviewed_at,
        }
