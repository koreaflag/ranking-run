"""Crew request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class CrewCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=2000)
    logo_url: str | None = None
    cover_image_url: str | None = None
    region: str | None = Field(None, max_length=100)
    max_members: int | None = Field(None, ge=2, le=1000)
    is_public: bool = True
    badge_color: str = "#FF7A33"
    badge_icon: str = "people"
    recurring_schedule: str | None = Field(None, max_length=200)
    meeting_point: str | None = Field(None, max_length=200)
    requires_approval: bool = False


class CrewUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=2000)
    logo_url: str | None = None
    cover_image_url: str | None = None
    region: str | None = Field(None, max_length=100)
    max_members: int | None = Field(None, ge=2, le=1000)
    is_public: bool | None = None
    badge_color: str | None = None
    badge_icon: str | None = None
    recurring_schedule: str | None = Field(None, max_length=200)
    meeting_point: str | None = Field(None, max_length=200)
    requires_approval: bool | None = None


class CrewOwnerInfo(BaseModel):
    id: str
    nickname: str | None = None
    avatar_url: str | None = None


class CrewResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    logo_url: str | None = None
    cover_image_url: str | None = None
    region: str | None = None
    owner: CrewOwnerInfo
    member_count: int
    max_members: int | None = None
    is_public: bool
    badge_color: str
    badge_icon: str
    recurring_schedule: str | None = None
    meeting_point: str | None = None
    requires_approval: bool = False
    is_member: bool = False
    my_role: str | None = None
    join_request_status: str | None = None
    created_at: datetime
    updated_at: datetime


class CrewListResponse(BaseModel):
    data: list[CrewResponse]
    total_count: int


class CrewMemberResponse(BaseModel):
    user_id: str
    nickname: str | None = None
    avatar_url: str | None = None
    role: str
    joined_at: datetime


class CrewMemberListResponse(BaseModel):
    data: list[CrewMemberResponse]
    total_count: int


class CrewRoleUpdateRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|member)$")


class CrewInviteByCodeRequest(BaseModel):
    user_code: str = Field(..., min_length=1, max_length=20)


# ---- Join Request schemas ----


class JoinRequestCreateRequest(BaseModel):
    message: str | None = Field(None, max_length=500)


class JoinRequestUserInfo(BaseModel):
    id: str
    nickname: str | None = None
    avatar_url: str | None = None


class JoinRequestResponse(BaseModel):
    id: str
    user: JoinRequestUserInfo
    message: str | None = None
    status: str
    created_at: datetime
    reviewed_at: datetime | None = None


class JoinRequestListResponse(BaseModel):
    data: list[JoinRequestResponse]
    total_count: int


class MyJoinRequestResponse(BaseModel):
    status: str | None = None
    request_id: str | None = None
