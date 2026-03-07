"""Group run request/response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ---- Request schemas ----


class GroupRunCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=30)
    course_id: UUID
    invite_user_ids: list[UUID] = Field(..., min_length=1, max_length=4)


class GroupRunInviteRequest(BaseModel):
    user_ids: list[UUID] = Field(..., min_length=1, max_length=4)


# ---- Response schemas ----


class GroupRunMemberInfo(BaseModel):
    user_id: str
    nickname: str | None = None
    avatar_url: str | None = None
    status: str
    best_duration_seconds: int | None = None
    best_pace_seconds_per_km: int | None = None


class GroupRankingInfo(BaseModel):
    rank: int | None = None
    avg_duration_seconds: int


class GroupRunResponse(BaseModel):
    id: str
    course_id: str
    course_name: str | None = None
    name: str
    creator_id: str | None = None
    status: str
    member_count: int
    members: list[GroupRunMemberInfo] = []
    my_status: str | None = None
    group_ranking: GroupRankingInfo | None = None
    created_at: datetime


class GroupRunListResponse(BaseModel):
    data: list[GroupRunResponse]
    total_count: int


# ---- Group Ranking schemas ----


class GroupRankingEntry(BaseModel):
    rank: int
    group_run_id: str
    group_name: str
    avg_duration_seconds: int
    completed_count: int
    total_members: int
    members: list[GroupRunMemberInfo] = []
    achieved_at: datetime


class GroupRankingListResponse(BaseModel):
    data: list[GroupRankingEntry]
    my_groups: list[GroupRankingEntry] = []
    total_groups: int
