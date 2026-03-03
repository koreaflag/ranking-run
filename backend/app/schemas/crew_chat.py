"""Crew chat request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class CrewMessageResponse(BaseModel):
    """Single chat message."""

    id: str
    event_id: str
    user_id: str | None
    nickname: str | None = None
    avatar_url: str | None = None
    content: str
    message_type: str
    created_at: datetime


class CrewMessageListResponse(BaseModel):
    """Cursor-paginated message list (newest first)."""

    data: list[CrewMessageResponse]
    has_more: bool


class CrewMessageCreateRequest(BaseModel):
    """Request body for sending a chat message."""

    content: str = Field(..., min_length=1, max_length=2000)
    message_type: str = Field("text", pattern="^(text|image|system)$")


class CrewUnreadItem(BaseModel):
    """Unread count for a single crew."""

    event_id: str
    title: str
    unread_count: int


class CrewAllUnreadResponse(BaseModel):
    """Unread counts across all crews for the current user."""

    data: list[CrewUnreadItem]


class CrewReadResponse(BaseModel):
    """Response after marking messages as read."""

    last_read_at: datetime
