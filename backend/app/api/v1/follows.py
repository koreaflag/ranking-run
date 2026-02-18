"""Follow endpoints: follow/unfollow users, list followers/following, friend activity."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.follow import (
    ActivityFeedItem,
    ActivityFeedResponse,
    FollowListResponse,
    FollowResponse,
    FollowStatusResponse,
    FollowUserInfo,
    FriendRunningInfo,
    FriendsRunningResponse,
)
from app.services.follow_service import FollowService

router = APIRouter(tags=["follows"])


def _to_follow_response_for_follower(follow) -> FollowResponse:
    """Map a Follow ORM instance to a response showing the follower user."""
    return FollowResponse(
        id=str(follow.id),
        user=FollowUserInfo(
            id=str(follow.follower.id),
            nickname=follow.follower.nickname,
            avatar_url=follow.follower.avatar_url,
        ),
        created_at=follow.created_at,
    )


def _to_follow_response_for_following(follow) -> FollowResponse:
    """Map a Follow ORM instance to a response showing the following user."""
    return FollowResponse(
        id=str(follow.id),
        user=FollowUserInfo(
            id=str(follow.following.id),
            nickname=follow.following.nickname,
            avatar_url=follow.following.avatar_url,
        ),
        created_at=follow.created_at,
    )


@router.post("/users/{user_id}/follow", response_model=FollowResponse, status_code=201)
@inject
async def follow_user(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> FollowResponse:
    """Follow a user."""
    follow = await follow_service.follow_user(
        db=db,
        follower_id=current_user.id,
        following_id=user_id,
    )
    return _to_follow_response_for_following(follow)


@router.delete("/users/{user_id}/follow", status_code=204)
@inject
async def unfollow_user(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> None:
    """Unfollow a user."""
    await follow_service.unfollow_user(
        db=db,
        follower_id=current_user.id,
        following_id=user_id,
    )


@router.get("/users/{user_id}/followers", response_model=FollowListResponse)
@inject
async def get_followers(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> FollowListResponse:
    """Get a user's followers."""
    follows, total_count = await follow_service.get_followers(
        db=db,
        user_id=user_id,
        page=page,
        per_page=per_page,
    )
    return FollowListResponse(
        data=[_to_follow_response_for_follower(f) for f in follows],
        total_count=total_count,
    )


@router.get("/users/{user_id}/following", response_model=FollowListResponse)
@inject
async def get_following(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> FollowListResponse:
    """Get users that a user is following."""
    follows, total_count = await follow_service.get_following(
        db=db,
        user_id=user_id,
        page=page,
        per_page=per_page,
    )
    return FollowListResponse(
        data=[_to_follow_response_for_following(f) for f in follows],
        total_count=total_count,
    )


@router.get("/users/{user_id}/follow-status", response_model=FollowStatusResponse)
@inject
async def get_follow_status(
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> FollowStatusResponse:
    """Get follow status between the authenticated user and a target user."""
    status = await follow_service.get_follow_status(
        db=db,
        current_user_id=current_user.id,
        target_user_id=user_id,
    )
    return FollowStatusResponse(**status)


@router.get("/follows/friends-running", response_model=FriendsRunningResponse)
@inject
async def get_friends_running(
    current_user: CurrentUser,
    db: DbSession,
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> FriendsRunningResponse:
    """Get friends who are currently on an active running session."""
    sessions = await follow_service.get_following_active_sessions(
        db=db,
        user_id=current_user.id,
    )
    return FriendsRunningResponse(
        data=[FriendRunningInfo(**s) for s in sessions]
    )


@router.get("/follows/activity-feed", response_model=ActivityFeedResponse)
@inject
async def get_activity_feed(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(20, ge=1, le=50),
    follow_service: FollowService = Depends(Provide[Container.follow_service]),
) -> ActivityFeedResponse:
    """Get recent activity feed from followed users."""
    items = await follow_service.get_activity_feed(
        db=db, user_id=current_user.id, limit=limit,
    )
    return ActivityFeedResponse(
        data=[ActivityFeedItem(**item) for item in items]
    )
