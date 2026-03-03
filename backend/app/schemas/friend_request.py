"""Friend request schemas."""

from datetime import datetime

from pydantic import BaseModel


class FriendRequestUserInfo(BaseModel):
    """Minimal user info embedded in friend request responses."""
    id: str
    nickname: str | None
    avatar_url: str | None


class FriendRequestResponse(BaseModel):
    """Single friend request entry."""
    id: str
    requester: FriendRequestUserInfo
    recipient: FriendRequestUserInfo
    status: str
    created_at: datetime


class FriendRequestListResponse(BaseModel):
    """List of friend requests."""
    data: list[FriendRequestResponse]
    total_count: int


class FriendItem(BaseModel):
    """A confirmed friend (accepted request)."""
    id: str
    user: FriendRequestUserInfo
    since: datetime


class FriendListResponse(BaseModel):
    """Paginated list of confirmed friends."""
    data: list[FriendItem]
    total_count: int


class FriendshipStatusResponse(BaseModel):
    """Friendship status between two users."""
    is_friend: bool
    request_status: str | None  # 'pending_sent', 'pending_received', 'accepted', None
    friends_count: int
