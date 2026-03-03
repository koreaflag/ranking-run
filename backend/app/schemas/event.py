"""Event request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class EventResponse(BaseModel):
    """Full event detail response."""
    id: str
    title: str
    description: str | None
    event_type: str
    course_id: str | None
    starts_at: datetime
    ends_at: datetime
    target_distance_meters: int | None
    target_runs: int | None
    badge_color: str
    badge_icon: str
    participant_count: int
    is_participating: bool
    is_active: bool
    center_lat: float | None
    center_lng: float | None
    recurring_schedule: str | None = None
    meeting_point: str | None = None
    creator_nickname: str | None = None
    my_progress_distance_meters: int | None = None
    my_progress_runs: int | None = None


class EventListResponse(BaseModel):
    """Paginated list of events."""
    data: list[EventResponse]
    total_count: int


class EventMapMarker(BaseModel):
    """Lightweight event marker for map display."""
    id: str
    title: str
    event_type: str
    badge_color: str
    badge_icon: str
    center_lat: float
    center_lng: float
    participant_count: int
    ends_at: datetime


class EventCreateRequest(BaseModel):
    """Request body for creating a new event."""
    title: str = Field(..., min_length=2, max_length=100)
    description: str | None = Field(None, max_length=1000)
    event_type: str = Field("challenge", pattern="^(challenge|crew|event)$")
    course_id: str | None = None
    starts_at: datetime
    ends_at: datetime
    target_distance_meters: int | None = None
    target_runs: int | None = None
    max_participants: int | None = Field(None, ge=1)
    recurring_schedule: str | None = Field(None, max_length=100)
    meeting_point: str | None = Field(None, max_length=200)
    center_lat: float | None = Field(None, ge=-90, le=90)
    center_lng: float | None = Field(None, ge=-180, le=180)
    badge_color: str = "#FF5252"
    badge_icon: str = "trophy"


class EventParticipantResponse(BaseModel):
    """Response after joining an event."""
    event_id: str
    user_id: str
    progress_distance_meters: int
    progress_runs: int
    completed: bool
    joined_at: datetime


class EventMemberResponse(BaseModel):
    """A single member of an event/crew."""
    user_id: str
    nickname: str | None = None
    avatar_url: str | None = None
    progress_distance_meters: int
    progress_runs: int
    completed: bool
    joined_at: datetime


class EventMemberListResponse(BaseModel):
    """List of event/crew members."""
    data: list[EventMemberResponse]
    total_count: int
