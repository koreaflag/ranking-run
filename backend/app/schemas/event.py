"""Event request/response schemas."""

from datetime import datetime

from pydantic import BaseModel


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


class EventParticipantResponse(BaseModel):
    """Response after joining an event."""
    event_id: str
    user_id: str
    progress_distance_meters: int
    progress_runs: int
    completed: bool
    joined_at: datetime
