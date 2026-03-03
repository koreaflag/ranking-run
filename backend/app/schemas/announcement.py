"""Announcement request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class AnnouncementCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    content: str | None = Field(None, max_length=5000)
    image_url: str | None = None
    link_type: str = "none"
    link_value: str | None = Field(None, max_length=500)
    priority: int = 0
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class AnnouncementResponse(BaseModel):
    id: str
    title: str
    content: str | None = None
    image_url: str | None = None
    link_type: str
    link_value: str | None = None
    priority: int
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    created_at: datetime


class AnnouncementListResponse(BaseModel):
    data: list[AnnouncementResponse]
