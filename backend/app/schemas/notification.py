"""Notification request/response schemas."""

from datetime import datetime

from pydantic import BaseModel


class NotificationActorInfo(BaseModel):
    id: str
    nickname: str | None = None
    avatar_url: str | None = None


class NotificationResponse(BaseModel):
    id: str
    type: str
    actor: NotificationActorInfo
    target_id: str | None = None
    target_type: str | None = None
    data: dict | None = None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    data: list[NotificationResponse]
    total_count: int
    unread_count: int


class UnreadCountResponse(BaseModel):
    count: int
