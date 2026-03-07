"""Crew challenge (raid run) request/response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# ---- Request schemas ----


class CrewChallengeCreateRequest(BaseModel):
    course_id: UUID


# ---- Response schemas ----


class CrewChallengeRecordInfo(BaseModel):
    user_id: str
    nickname: str | None = None
    avatar_url: str | None = None
    best_duration_seconds: int | None = None
    best_pace_seconds_per_km: int | None = None
    completed_at: datetime | None = None
    run_count: int = 0


class CrewChallengeResponse(BaseModel):
    id: str
    crew_id: str
    course_id: str
    course_name: str | None = None
    course_distance_meters: float | None = None
    created_by: str | None = None
    status: str
    records: list[CrewChallengeRecordInfo] = []
    completed_count: int = 0
    total_participants: int = 0
    created_at: datetime
    ended_at: datetime | None = None


class CrewChallengeHistoryResponse(BaseModel):
    data: list[CrewChallengeResponse]
    total_count: int


# ---- Crew course ranking schemas ----


class CrewCourseRankingEntry(BaseModel):
    rank: int
    crew_id: str
    crew_name: str
    crew_logo_url: str | None = None
    crew_badge_color: str = "#FF7A33"
    avg_duration_seconds: int
    completed_count: int
    total_participants: int
    achieved_at: datetime


class CrewCourseRankingListResponse(BaseModel):
    data: list[CrewCourseRankingEntry]
    my_crews: list[CrewCourseRankingEntry] = []
    total_crews: int
