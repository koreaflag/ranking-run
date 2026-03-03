"""Community post/comment/like request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class PostAuthor(BaseModel):
    """Lightweight author info embedded in post/comment responses."""

    id: str
    nickname: str | None = None
    avatar_url: str | None = None
    crew_name: str | None = None


class CommunityCommentResponse(BaseModel):
    """Single comment."""

    id: str
    post_id: str
    author: PostAuthor
    content: str
    created_at: datetime


class CommunityPostResponse(BaseModel):
    """Single community post."""

    id: str
    author: PostAuthor
    title: str
    content: str
    post_type: str
    event_id: str | None = None
    crew_id: str | None = None
    image_url: str | None = None
    like_count: int
    comment_count: int
    is_liked: bool = False
    created_at: datetime
    updated_at: datetime


class CommunityPostListResponse(BaseModel):
    """Paginated list of posts."""

    data: list[CommunityPostResponse]
    total_count: int


class CommunityPostCreateRequest(BaseModel):
    """Request body for creating a community post."""

    title: str = Field(..., min_length=1, max_length=100)
    content: str = Field(..., min_length=1, max_length=5000)
    post_type: str = Field(
        "general",
        pattern="^(general|crew_recruit|crew_promo|race_review|question|tip)$",
    )
    event_id: str | None = None
    crew_id: str | None = None
    image_url: str | None = None


class CommunityPostUpdateRequest(BaseModel):
    """Request body for updating a community post (author only)."""

    title: str | None = Field(None, min_length=1, max_length=100)
    content: str | None = Field(None, min_length=1, max_length=5000)
    image_url: str | None = None


class CommunityPostDetailResponse(BaseModel):
    """Post detail with first comments embedded."""

    id: str
    author: PostAuthor
    title: str
    content: str
    post_type: str
    event_id: str | None = None
    crew_id: str | None = None
    image_url: str | None = None
    like_count: int
    comment_count: int
    is_liked: bool = False
    created_at: datetime
    updated_at: datetime
    recent_comments: list[CommunityCommentResponse]


class CommunityCommentListResponse(BaseModel):
    """Paginated list of comments."""

    data: list[CommunityCommentResponse]
    total_count: int


class CommunityCommentCreateRequest(BaseModel):
    """Request body for creating a comment."""

    content: str = Field(..., min_length=1, max_length=1000)


class CommunityLikeResponse(BaseModel):
    """Response after toggling a like."""

    is_liked: bool
    like_count: int
