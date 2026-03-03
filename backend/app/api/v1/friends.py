"""Friend request endpoints: send, accept, decline, cancel, list friends."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.friend_request import (
    FriendItem,
    FriendListResponse,
    FriendRequestListResponse,
    FriendRequestResponse,
    FriendRequestUserInfo,
    FriendshipStatusResponse,
)
from app.services.friend_request_service import FriendRequestService

router = APIRouter(tags=["friends"])


def _to_request_response(req) -> FriendRequestResponse:
    return FriendRequestResponse(
        id=str(req.id),
        requester=FriendRequestUserInfo(
            id=str(req.requester.id),
            nickname=req.requester.nickname,
            avatar_url=req.requester.avatar_url,
        ),
        recipient=FriendRequestUserInfo(
            id=str(req.recipient.id),
            nickname=req.recipient.nickname,
            avatar_url=req.recipient.avatar_url,
        ),
        status=req.status,
        created_at=req.created_at,
    )


def _to_friend_item(req, current_user_id: UUID) -> FriendItem:
    """Map accepted FriendRequest to FriendItem, showing the other user."""
    other = req.recipient if req.requester_id == current_user_id else req.requester
    return FriendItem(
        id=str(req.id),
        user=FriendRequestUserInfo(
            id=str(other.id),
            nickname=other.nickname,
            avatar_url=other.avatar_url,
        ),
        since=req.updated_at,
    )


# ── Send friend request ──────────────────────────────────────────

@router.post("/friend-requests/{user_id}", response_model=FriendRequestResponse, status_code=201)
@inject
async def send_friend_request(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> FriendRequestResponse:
    """Send a friend request to a user."""
    req = await service.send_request(db=db, requester_id=current_user.id, recipient_id=user_id)
    return _to_request_response(req)


# ── Accept friend request ────────────────────────────────────────

@router.patch("/friend-requests/{request_id}/accept", response_model=FriendRequestResponse)
@inject
async def accept_friend_request(
    request_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> FriendRequestResponse:
    """Accept a pending friend request."""
    req = await service.accept_request(db=db, request_id=request_id, current_user_id=current_user.id)
    return _to_request_response(req)


# ── Decline friend request ───────────────────────────────────────

@router.patch("/friend-requests/{request_id}/decline", status_code=204)
@inject
async def decline_friend_request(
    request_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> None:
    """Decline a pending friend request."""
    await service.decline_request(db=db, request_id=request_id, current_user_id=current_user.id)


# ── Cancel sent request ──────────────────────────────────────────

@router.delete("/friend-requests/{request_id}", status_code=204)
@inject
async def cancel_friend_request(
    request_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> None:
    """Cancel a pending friend request you sent."""
    await service.cancel_request(db=db, request_id=request_id, current_user_id=current_user.id)


# ── Remove friend ────────────────────────────────────────────────

@router.delete("/friends/{user_id}", status_code=204)
@inject
async def remove_friend(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> None:
    """Remove a friend (unfriend)."""
    await service.remove_friend(db=db, friend_user_id=user_id, current_user_id=current_user.id)


# ── List received requests ───────────────────────────────────────

@router.get("/friend-requests/received", response_model=FriendRequestListResponse)
@inject
async def get_received_requests(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> FriendRequestListResponse:
    """List pending friend requests received."""
    requests, total = await service.get_received_requests(
        db=db, user_id=current_user.id, page=page, per_page=per_page,
    )
    return FriendRequestListResponse(
        data=[_to_request_response(r) for r in requests],
        total_count=total,
    )


# ── List sent requests ───────────────────────────────────────────

@router.get("/friend-requests/sent", response_model=FriendRequestListResponse)
@inject
async def get_sent_requests(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> FriendRequestListResponse:
    """List pending friend requests you sent."""
    requests, total = await service.get_sent_requests(
        db=db, user_id=current_user.id, page=page, per_page=per_page,
    )
    return FriendRequestListResponse(
        data=[_to_request_response(r) for r in requests],
        total_count=total,
    )


# ── List friends ─────────────────────────────────────────────────

@router.get("/friends", response_model=FriendListResponse)
@inject
async def get_friends(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> FriendListResponse:
    """List confirmed friends."""
    requests, total = await service.get_friends(
        db=db, user_id=current_user.id, page=page, per_page=per_page,
    )
    return FriendListResponse(
        data=[_to_friend_item(r, current_user.id) for r in requests],
        total_count=total,
    )


# ── Friendship status ────────────────────────────────────────────

@router.get("/users/{user_id}/friendship-status", response_model=FriendshipStatusResponse)
@inject
async def get_friendship_status(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> FriendshipStatusResponse:
    """Get friendship status between the authenticated user and a target user."""
    status = await service.get_friendship_status(
        db=db, current_user_id=current_user.id, target_user_id=user_id,
    )
    return FriendshipStatusResponse(**status)


# ── Pending request count ─────────────────────────────────────────

@router.get("/friend-requests/pending-count")
@inject
async def get_pending_count(
    current_user: CurrentUser,
    db: DbSession,
    service: FriendRequestService = Depends(Provide[Container.friend_request_service]),
) -> dict:
    """Get count of pending friend requests for badge display."""
    count = await service.get_pending_count(db=db, user_id=current_user.id)
    return {"count": count}
