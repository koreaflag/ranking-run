"""Favorite schemas."""

from datetime import datetime
from pydantic import BaseModel


class FavoriteToggleResponse(BaseModel):
    is_favorited: bool


class FavoriteCourseItem(BaseModel):
    id: str
    title: str
    thumbnail_url: str | None
    distance_meters: float
    estimated_duration_seconds: int
    creator_nickname: str
    favorited_at: datetime

    model_config = {"from_attributes": True}
