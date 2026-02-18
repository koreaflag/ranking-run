"""Follow request/response schemas."""

from datetime import datetime

from pydantic import BaseModel


class FollowUserInfo(BaseModel):
    """Minimal user info embedded in follow responses."""
    id: str
    nickname: str | None
    avatar_url: str | None


class FollowResponse(BaseModel):
    """Single follow entry (used for both follower and following lists)."""
    id: str
    user: FollowUserInfo
    created_at: datetime


class FollowListResponse(BaseModel):
    """Paginated list of follow relationships."""
    data: list[FollowResponse]
    total_count: int


class FollowStatusResponse(BaseModel):
    """Current follow status between the authenticated user and a target user."""
    is_following: bool
    followers_count: int
    following_count: int


class FriendRunningInfo(BaseModel):
    """A friend currently on an active running session."""
    user_id: str
    nickname: str | None
    avatar_url: str | None
    session_id: str
    started_at: datetime
    course_id: str | None


class FriendsRunningResponse(BaseModel):
    """List of friends who are currently running."""
    data: list[FriendRunningInfo]


class ActivityFeedItem(BaseModel):
    """A single activity in the friend feed."""
    type: str  # 'run_completed' or 'course_created'
    user_id: str
    nickname: str | None
    avatar_url: str | None
    # Run fields (when type == 'run_completed')
    run_id: str | None = None
    distance_meters: int | None = None
    duration_seconds: int | None = None
    course_title: str | None = None
    # Course fields (when type == 'course_created')
    course_id: str | None = None
    course_title_created: str | None = None
    course_distance_meters: int | None = None
    # Common
    created_at: datetime


class ActivityFeedResponse(BaseModel):
    """Paginated activity feed from followed users."""
    data: list[ActivityFeedItem]
