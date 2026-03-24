"""Live group run request/response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ---- Request schemas ----


class LiveGroupRunCreateRequest(BaseModel):
    course_id: UUID
    title: str = Field(..., min_length=1, max_length=100)
    max_participants: int = Field(default=10, ge=2, le=50)
    scheduled_at: datetime | None = None


# ---- Response schemas ----


class LiveGroupRunParticipantResponse(BaseModel):
    user_id: str
    nickname: str | None = None
    avatar_url: str | None = None
    status: str
    current_distance_m: float = 0
    current_duration_s: int = 0
    last_lat: float | None = None
    last_lng: float | None = None
    pace: str | None = None
    joined_at: datetime


class LiveGroupRunResponse(BaseModel):
    id: str
    course_id: str
    course_name: str | None = None
    host_user_id: str
    host_nickname: str | None = None
    title: str
    status: str
    max_participants: int
    participant_count: int
    participants: list[LiveGroupRunParticipantResponse] = []
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime


class LiveGroupRunListResponse(BaseModel):
    data: list[LiveGroupRunResponse]
    total_count: int


# ---- WebSocket message schemas ----


class WSLocationMessage(BaseModel):
    type: str = "location"
    lat: float
    lng: float
    distance_m: float
    duration_s: int
    pace: str | None = None


class WSParticipantData(BaseModel):
    user_id: str
    nickname: str | None = None
    avatar_url: str | None = None
    lat: float | None = None
    lng: float | None = None
    distance_m: float = 0
    pace: str | None = None
    status: str = "joined"


class WSParticipantsMessage(BaseModel):
    type: str = "participants"
    data: list[WSParticipantData]


class WSStartedMessage(BaseModel):
    type: str = "started"


class WSCompletedMessage(BaseModel):
    type: str = "completed"
    user_id: str


class WSErrorMessage(BaseModel):
    type: str = "error"
    message: str
