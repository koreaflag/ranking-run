"""Friend request service: send, accept, decline, cancel, list friends."""

from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
from app.models.friend_request import FriendRequest
from app.models.user import User


class FriendRequestService:
    """Handles friend request operations and friend lists."""

    # ── Send request ──────────────────────────────────────────────

    async def send_request(
        self, db: AsyncSession, requester_id: UUID, recipient_id: UUID
    ) -> FriendRequest:
        if requester_id == recipient_id:
            raise ValidationError(code="SELF_REQUEST", message="자기 자신에게 친구 요청을 보낼 수 없습니다")

        # Verify recipient exists
        target = await db.execute(select(User.id).where(User.id == recipient_id))
        if target.scalar_one_or_none() is None:
            raise NotFoundError(code="NOT_FOUND", message="사용자를 찾을 수 없습니다")

        # Check existing request in either direction
        existing = await db.execute(
            select(FriendRequest).where(
                or_(
                    and_(
                        FriendRequest.requester_id == requester_id,
                        FriendRequest.recipient_id == recipient_id,
                    ),
                    and_(
                        FriendRequest.requester_id == recipient_id,
                        FriendRequest.recipient_id == requester_id,
                    ),
                )
            )
        )
        existing_req = existing.scalar_one_or_none()

        if existing_req is not None:
            if existing_req.status == "accepted":
                raise ConflictError(code="ALREADY_FRIENDS", message="이미 친구입니다")
            if existing_req.status == "pending":
                # If the other person already sent us a request, auto-accept
                if existing_req.requester_id == recipient_id:
                    existing_req.status = "accepted"
                    await db.flush()
                    await db.refresh(existing_req, attribute_names=["requester", "recipient"])
                    return existing_req
                raise ConflictError(code="ALREADY_REQUESTED", message="이미 친구 요청을 보냈습니다")
            if existing_req.status == "declined":
                # Allow re-request by updating the old record
                existing_req.requester_id = requester_id
                existing_req.recipient_id = recipient_id
                existing_req.status = "pending"
                await db.flush()
                await db.refresh(existing_req, attribute_names=["requester", "recipient"])
                return existing_req

        friend_request = FriendRequest(
            requester_id=requester_id,
            recipient_id=recipient_id,
            status="pending",
        )
        db.add(friend_request)
        await db.flush()
        await db.refresh(friend_request, attribute_names=["requester", "recipient"])
        return friend_request

    # ── Accept request ────────────────────────────────────────────

    async def accept_request(
        self, db: AsyncSession, request_id: UUID, current_user_id: UUID
    ) -> FriendRequest:
        result = await db.execute(
            select(FriendRequest)
            .options(joinedload(FriendRequest.requester), joinedload(FriendRequest.recipient))
            .where(FriendRequest.id == request_id)
        )
        req = result.scalar_one_or_none()
        if req is None:
            raise NotFoundError(code="NOT_FOUND", message="친구 요청을 찾을 수 없습니다")
        if req.recipient_id != current_user_id:
            raise PermissionDeniedError(code="FORBIDDEN", message="본인에게 온 요청만 수락할 수 있습니다")
        if req.status != "pending":
            raise ConflictError(code="NOT_PENDING", message="대기 중인 요청이 아닙니다")

        req.status = "accepted"
        await db.flush()
        await db.refresh(req, attribute_names=["requester", "recipient"])
        return req

    # ── Decline request ───────────────────────────────────────────

    async def decline_request(
        self, db: AsyncSession, request_id: UUID, current_user_id: UUID
    ) -> None:
        result = await db.execute(
            select(FriendRequest).where(FriendRequest.id == request_id)
        )
        req = result.scalar_one_or_none()
        if req is None:
            raise NotFoundError(code="NOT_FOUND", message="친구 요청을 찾을 수 없습니다")
        if req.recipient_id != current_user_id:
            raise PermissionDeniedError(code="FORBIDDEN", message="본인에게 온 요청만 거절할 수 있습니다")
        if req.status != "pending":
            raise ConflictError(code="NOT_PENDING", message="대기 중인 요청이 아닙니다")

        req.status = "declined"
        await db.flush()

    # ── Cancel sent request ───────────────────────────────────────

    async def cancel_request(
        self, db: AsyncSession, request_id: UUID, current_user_id: UUID
    ) -> None:
        result = await db.execute(
            select(FriendRequest).where(FriendRequest.id == request_id)
        )
        req = result.scalar_one_or_none()
        if req is None:
            raise NotFoundError(code="NOT_FOUND", message="친구 요청을 찾을 수 없습니다")
        if req.requester_id != current_user_id:
            raise PermissionDeniedError(code="FORBIDDEN", message="본인이 보낸 요청만 취소할 수 있습니다")
        if req.status != "pending":
            raise ConflictError(code="NOT_PENDING", message="대기 중인 요청이 아닙니다")

        await db.delete(req)
        await db.flush()

    # ── Remove friend (unfriend) ──────────────────────────────────

    async def remove_friend(
        self, db: AsyncSession, friend_user_id: UUID, current_user_id: UUID
    ) -> None:
        result = await db.execute(
            select(FriendRequest).where(
                FriendRequest.status == "accepted",
                or_(
                    and_(
                        FriendRequest.requester_id == current_user_id,
                        FriendRequest.recipient_id == friend_user_id,
                    ),
                    and_(
                        FriendRequest.requester_id == friend_user_id,
                        FriendRequest.recipient_id == current_user_id,
                    ),
                ),
            )
        )
        req = result.scalar_one_or_none()
        if req is None:
            raise NotFoundError(code="NOT_FRIENDS", message="친구 관계가 아닙니다")

        await db.delete(req)
        await db.flush()

    # ── List received pending requests ────────────────────────────

    async def get_received_requests(
        self, db: AsyncSession, user_id: UUID, page: int = 0, per_page: int = 20
    ) -> tuple[list[FriendRequest], int]:
        count_result = await db.execute(
            select(func.count(FriendRequest.id)).where(
                FriendRequest.recipient_id == user_id,
                FriendRequest.status == "pending",
            )
        )
        total = count_result.scalar_one()

        result = await db.execute(
            select(FriendRequest)
            .where(
                FriendRequest.recipient_id == user_id,
                FriendRequest.status == "pending",
            )
            .options(joinedload(FriendRequest.requester), joinedload(FriendRequest.recipient))
            .order_by(FriendRequest.created_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )
        requests = result.scalars().unique().all()
        return list(requests), total

    # ── List sent pending requests ────────────────────────────────

    async def get_sent_requests(
        self, db: AsyncSession, user_id: UUID, page: int = 0, per_page: int = 20
    ) -> tuple[list[FriendRequest], int]:
        count_result = await db.execute(
            select(func.count(FriendRequest.id)).where(
                FriendRequest.requester_id == user_id,
                FriendRequest.status == "pending",
            )
        )
        total = count_result.scalar_one()

        result = await db.execute(
            select(FriendRequest)
            .where(
                FriendRequest.requester_id == user_id,
                FriendRequest.status == "pending",
            )
            .options(joinedload(FriendRequest.requester), joinedload(FriendRequest.recipient))
            .order_by(FriendRequest.created_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )
        requests = result.scalars().unique().all()
        return list(requests), total

    # ── List friends (accepted) ───────────────────────────────────

    async def get_friends(
        self, db: AsyncSession, user_id: UUID, page: int = 0, per_page: int = 20
    ) -> tuple[list[FriendRequest], int]:
        where_clause = and_(
            FriendRequest.status == "accepted",
            or_(
                FriendRequest.requester_id == user_id,
                FriendRequest.recipient_id == user_id,
            ),
        )

        count_result = await db.execute(
            select(func.count(FriendRequest.id)).where(where_clause)
        )
        total = count_result.scalar_one()

        result = await db.execute(
            select(FriendRequest)
            .where(where_clause)
            .options(joinedload(FriendRequest.requester), joinedload(FriendRequest.recipient))
            .order_by(FriendRequest.updated_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )
        requests = result.scalars().unique().all()
        return list(requests), total

    # ── Friendship status ─────────────────────────────────────────

    async def get_friendship_status(
        self, db: AsyncSession, current_user_id: UUID, target_user_id: UUID
    ) -> dict:
        # Check request between the two users
        result = await db.execute(
            select(FriendRequest).where(
                or_(
                    and_(
                        FriendRequest.requester_id == current_user_id,
                        FriendRequest.recipient_id == target_user_id,
                    ),
                    and_(
                        FriendRequest.requester_id == target_user_id,
                        FriendRequest.recipient_id == current_user_id,
                    ),
                )
            )
        )
        req = result.scalar_one_or_none()

        is_friend = False
        request_status = None
        if req is not None:
            if req.status == "accepted":
                is_friend = True
                request_status = "accepted"
            elif req.status == "pending":
                if req.requester_id == current_user_id:
                    request_status = "pending_sent"
                else:
                    request_status = "pending_received"

        # Count total friends
        friends_count_result = await db.execute(
            select(func.count(FriendRequest.id)).where(
                FriendRequest.status == "accepted",
                or_(
                    FriendRequest.requester_id == target_user_id,
                    FriendRequest.recipient_id == target_user_id,
                ),
            )
        )
        friends_count = friends_count_result.scalar_one()

        return {
            "is_friend": is_friend,
            "request_status": request_status,
            "friends_count": friends_count,
        }

    # ── Pending request count (for badges) ────────────────────────

    async def get_pending_count(
        self, db: AsyncSession, user_id: UUID
    ) -> int:
        result = await db.execute(
            select(func.count(FriendRequest.id)).where(
                FriendRequest.recipient_id == user_id,
                FriendRequest.status == "pending",
            )
        )
        return result.scalar_one()
