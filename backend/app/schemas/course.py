"""Course request/response schemas."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class GeoJSONLineString(BaseModel):
    """GeoJSON LineString geometry."""
    type: str = "LineString"
    coordinates: list[list[float]] = Field(
        description="Array of [lng, lat] or [lng, lat, alt] coordinate arrays"
    )


class CourseCreatorInfo(BaseModel):
    """Creator info embedded in course responses."""
    id: str
    nickname: str | None
    avatar_url: str | None


class CourseStatsInfo(BaseModel):
    """Course statistics embedded in course list responses."""
    total_runs: int = 0
    unique_runners: int = 0
    avg_pace_seconds_per_km: int | None = None


class CourseCreateRequest(BaseModel):
    """Request to create a course from a run record."""
    run_record_id: str
    title: str = Field(..., min_length=2, max_length=30)
    description: str | None = Field(None, max_length=500)
    route_geometry: GeoJSONLineString
    distance_meters: int = Field(..., gt=0)
    estimated_duration_seconds: int = Field(..., gt=0)
    elevation_gain_meters: int = Field(0, ge=0)
    elevation_profile: list[float] = []
    is_public: bool = True
    tags: list[str] = []
    course_type: str | None = None  # "normal" or "loop"
    lap_count: int | None = Field(None, ge=1, le=10)


class CourseCreateResponse(BaseModel):
    """Response after course creation."""
    id: str
    title: str
    distance_meters: int
    thumbnail_url: str | None = None
    share_url: str | None = None
    created_at: datetime


class CourseListItem(BaseModel):
    """Single course in a list response."""
    id: str
    title: str
    thumbnail_url: str | None
    distance_meters: int
    estimated_duration_seconds: int | None
    elevation_gain_meters: int
    creator: CourseCreatorInfo
    stats: CourseStatsInfo
    created_at: datetime
    distance_from_user_meters: float | None = None


class CourseListResponse(BaseModel):
    """Paginated course list response."""
    data: list[CourseListItem]
    total_count: int
    has_next: bool


class CourseDetail(BaseModel):
    """Full course detail with route geometry."""
    id: str
    title: str
    description: str | None
    route_geometry: Any | None = Field(description="GeoJSON LineString")
    distance_meters: int
    estimated_duration_seconds: int | None
    elevation_gain_meters: int
    elevation_profile: list[float] | None
    thumbnail_url: str | None
    is_public: bool
    created_at: datetime
    creator: CourseCreatorInfo


class CourseStatsResponse(BaseModel):
    """Course statistics response."""
    course_id: str
    total_runs: int = 0
    unique_runners: int = 0
    avg_duration_seconds: int | None = None
    avg_pace_seconds_per_km: int | None = None
    best_duration_seconds: int | None = None
    best_pace_seconds_per_km: int | None = None
    completion_rate: float = 0.0
    runs_by_hour: dict[str, int] = {}
    updated_at: datetime | None = None


class CourseUpdateRequest(BaseModel):
    """Partial course update request."""
    title: str | None = Field(None, min_length=2, max_length=30)
    description: str | None = Field(None, max_length=500)
    is_public: bool | None = None
    tags: list[str] | None = None


class CourseMarker(BaseModel):
    """Lightweight course data for map markers."""
    id: str
    title: str
    start_lat: float
    start_lng: float
    distance_meters: int
    total_runs: int = 0
    difficulty: str | None = None
    avg_rating: float | None = None
    active_runners: int = 0
    is_new: bool = False
    elevation_gain_meters: int = 0
    creator_nickname: str | None = None


class NearbyCourse(BaseModel):
    """Nearby course for home screen."""
    id: str
    title: str
    thumbnail_url: str | None
    distance_meters: int
    estimated_duration_seconds: int | None
    total_runs: int = 0
    avg_pace_seconds_per_km: int | None = None
    creator_nickname: str | None
    distance_from_user_meters: float


class MyCourseItem(BaseModel):
    """Course owned by the current user."""
    id: str
    title: str
    distance_meters: int
    thumbnail_url: str | None
    is_public: bool
    created_at: datetime
    stats: CourseStatsInfo
