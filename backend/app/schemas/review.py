"""Review request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class ReviewCreateRequest(BaseModel):
    """Request to create a course review.

    At least one of rating or content must be provided.
    """
    rating: int | None = Field(None, ge=1, le=5)
    content: str | None = Field(None, max_length=500)

    @model_validator(mode="after")
    def check_at_least_one_field(self) -> "ReviewCreateRequest":
        if self.rating is None and not self.content:
            raise ValueError("rating 또는 content 중 하나는 반드시 입력해야 합니다")
        return self


class ReviewUpdateRequest(BaseModel):
    """Partial update request for a review."""
    rating: int | None = Field(None, ge=1, le=5)
    content: str | None = Field(None, max_length=500)


class ReviewAuthorInfo(BaseModel):
    """Author info embedded in review responses."""
    id: str
    nickname: str | None
    avatar_url: str | None


class ReviewResponse(BaseModel):
    """Single review entry."""
    id: str
    course_id: str
    rating: int | None
    content: str | None
    author: ReviewAuthorInfo
    created_at: datetime
    updated_at: datetime
    creator_reply: str | None = None
    creator_reply_at: datetime | None = None


class CreatorReplyRequest(BaseModel):
    """Request for a course creator to reply to a review."""
    content: str = Field(..., min_length=1, max_length=300)


class ReviewListResponse(BaseModel):
    """Paginated review list with aggregate stats."""
    data: list[ReviewResponse]
    total_count: int
    avg_rating: float | None
