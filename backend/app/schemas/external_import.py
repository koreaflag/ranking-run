"""External import schemas for GPX/FIT file imports."""

from datetime import datetime

from pydantic import BaseModel


class ImportUploadResponse(BaseModel):
    import_id: str
    status: str
    message: str


class ImportSummary(BaseModel):
    distance_meters: int
    duration_seconds: int
    avg_pace_seconds_per_km: int | None = None
    elevation_gain_meters: int = 0
    elevation_loss_meters: int = 0
    point_count: int = 0
    source_device: str | None = None


class CourseMatchInfo(BaseModel):
    course_id: str
    course_title: str
    match_percent: float
    is_completed: bool


class ImportDetailResponse(BaseModel):
    id: str
    source: str
    status: str
    external_id: str | None = None
    original_filename: str | None = None
    import_summary: ImportSummary | None = None
    course_match: CourseMatchInfo | None = None
    run_record_id: str | None = None
    error_message: str | None = None
    created_at: datetime


class ImportListResponse(BaseModel):
    data: list[ImportDetailResponse]
    total_count: int
    has_next: bool
