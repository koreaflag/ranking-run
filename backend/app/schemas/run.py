"""Run session, chunk, and record schemas."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# --- Device Info ---

class DeviceInfo(BaseModel):
    platform: str = Field(description="android or ios")
    os_version: str
    device_model: str
    app_version: str


# --- GPS Points ---

class RawGPSPoint(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    alt: float = 0.0
    speed: float = Field(default=0.0, ge=0.0)
    bearing: float = Field(default=0.0, ge=0.0, le=360.0)
    accuracy: float = Field(default=0.0, ge=0.0)
    timestamp: int = Field(description="Unix timestamp in milliseconds")


class FilteredPoint(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    alt: float = 0.0
    speed: float = Field(default=0.0, ge=0.0)
    bearing: float = Field(default=0.0, ge=0.0, le=360.0)
    timestamp: int
    is_interpolated: bool = False


# --- Chunk Summary ---

class ChunkSummary(BaseModel):
    distance_meters: float
    duration_seconds: int
    avg_pace_seconds_per_km: int = 0
    elevation_change_meters: float = 0.0
    point_count: int
    start_timestamp: int
    end_timestamp: int


class CumulativeSummary(BaseModel):
    total_distance_meters: float
    total_duration_seconds: int
    avg_pace_seconds_per_km: int = 0


class SplitInfo(BaseModel):
    split_number: int
    distance_meters: float = 0.0
    duration_seconds: int
    pace_seconds_per_km: int
    elevation_change_meters: float = 0.0


class PauseInterval(BaseModel):
    paused_at: str
    resumed_at: str


# --- Session Create ---

class SessionCreateRequest(BaseModel):
    course_id: str | None = None
    started_at: datetime
    device_info: DeviceInfo | None = None


class SessionCreateResponse(BaseModel):
    session_id: str
    created_at: datetime


# --- Chunk Upload ---

class ChunkUploadRequest(BaseModel):
    session_id: str
    sequence: int = Field(..., ge=0, le=10000)
    chunk_type: str = Field(
        ...,
        pattern="^(intermediate|final)$",
        description="intermediate or final",
    )
    raw_gps_points: list[RawGPSPoint] = Field(..., max_length=10000)
    filtered_points: list[FilteredPoint] | None = Field(None, max_length=10000)
    chunk_summary: ChunkSummary
    cumulative: CumulativeSummary
    completed_splits: list[SplitInfo] = []
    pause_intervals: list[PauseInterval] = []


class ChunkUploadResponse(BaseModel):
    chunk_id: str
    sequence: int
    received_at: datetime


# --- Batch Chunk Upload ---

class BatchChunkUploadRequest(BaseModel):
    session_id: str
    chunks: list[ChunkUploadRequest]


class BatchChunkUploadResponse(BaseModel):
    received_sequences: list[int]
    failed_sequences: list[int]


# --- Run Complete ---

class GeoJSONLineString(BaseModel):
    type: str = "LineString"
    coordinates: list[list[float]]

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v: list[list[float]]) -> list[list[float]]:
        for coord in v:
            if len(coord) < 2:
                raise ValueError("Each coordinate must have at least [lng, lat]")
            lng, lat = coord[0], coord[1]
            if not (-180.0 <= lng <= 180.0):
                raise ValueError(f"Longitude {lng} out of range [-180, 180]")
            if not (-90.0 <= lat <= 90.0):
                raise ValueError(f"Latitude {lat} out of range [-90, 90]")
        return v


class RunSplitDetail(BaseModel):
    split_number: int | None = None
    distance_meters: float
    duration_seconds: int
    pace_seconds_per_km: int
    elevation_change_meters: float = 0.0


class CourseCompletionInfo(BaseModel):
    is_completed: bool
    max_deviation_meters: float
    deviation_points: int
    route_match_percent: float


class FilterConfig(BaseModel):
    kalman_q: float
    kalman_r_base: float
    outlier_speed_threshold: float
    outlier_accuracy_threshold: float


class CheckpointPass(BaseModel):
    """Client-reported checkpoint passage during a run."""
    checkpoint_id: int
    timestamp: float
    distance_from_checkpoint: float


class RunCompleteRequest(BaseModel):
    distance_meters: int = Field(..., ge=0, le=500_000)
    duration_seconds: int = Field(..., ge=0, le=86_400)
    total_elapsed_seconds: int | None = Field(default=None, ge=0, le=86_400)
    avg_pace_seconds_per_km: int | None = Field(default=None, ge=0)
    best_pace_seconds_per_km: int | None = Field(default=None, ge=0)
    avg_speed_ms: float | None = Field(default=None, ge=0)
    max_speed_ms: float | None = Field(default=None, ge=0)
    calories: int | None = Field(default=None, ge=0)
    finished_at: datetime

    route_geometry: GeoJSONLineString | None = None
    elevation_gain_meters: int = Field(default=0, ge=0)
    elevation_loss_meters: int = Field(default=0, ge=0)
    elevation_profile: list[float] = []

    splits: list[RunSplitDetail] = []
    pause_intervals: list[PauseInterval] = []

    course_completion: CourseCompletionInfo | None = None
    filter_config: FilterConfig | None = None
    checkpoint_passes: list[CheckpointPass] | None = None

    goal_data: dict | None = None

    total_chunks: int = 0
    uploaded_chunk_sequences: list[int] = []


class RankingInfo(BaseModel):
    rank: int
    total_runners: int
    is_personal_best: bool
    previous_best_duration: int | None = None


class UserStatsUpdate(BaseModel):
    total_distance_meters: int
    total_runs: int
    streak_days: int = 0
    runner_level: int = 1


class RunCompleteResponse(BaseModel):
    run_record_id: str
    ranking: RankingInfo | None = None
    is_flagged: bool = False
    flag_reason: str | None = None
    route_match_percent: float | None = None
    max_deviation_meters: float | None = None
    user_stats_update: UserStatsUpdate
    missing_chunk_sequences: list[int] = []
    points_earned: int = 0
    course_streak: int | None = None
    map_matching_confidence: float | None = None


# --- Run Recover ---

class RunRecoverRequest(BaseModel):
    finished_at: datetime
    total_chunks: int
    uploaded_chunk_sequences: list[int] = []


class RunRecoverResponse(BaseModel):
    run_record_id: str
    recovered_distance_meters: int
    recovered_duration_seconds: int
    missing_chunk_sequences: list[int] = []


# --- Run Record Detail ---

class RunCourseInfo(BaseModel):
    id: str
    title: str
    distance_meters: int | None = None


class RunCourseCompletion(BaseModel):
    is_completed: bool
    route_match_percent: float
    ranking_at_time: int | None = None


class RunRecordDetail(BaseModel):
    id: str
    user_id: str
    course_id: str | None
    distance_meters: int
    duration_seconds: int
    total_elapsed_seconds: int | None
    avg_pace_seconds_per_km: int | None
    best_pace_seconds_per_km: int | None
    avg_speed_ms: float | None
    max_speed_ms: float | None
    calories: int | None
    elevation_gain_meters: int
    elevation_loss_meters: int
    route_geometry: Any | None
    elevation_profile: list[float] | None
    splits: list[RunSplitDetail] | None
    started_at: datetime
    finished_at: datetime
    course: RunCourseInfo | None = None
    course_completion: RunCourseCompletion | None = None
    goal_data: dict | None = None


# --- Run History ---

class RunHistoryItem(BaseModel):
    id: str
    distance_meters: int
    duration_seconds: int
    avg_pace_seconds_per_km: int | None
    elevation_gain_meters: int
    started_at: datetime
    finished_at: datetime
    course: RunCourseInfo | None = None
    device_model: str | None = None
    route_preview: list[list[float]] | None = None
    goal_data: dict | None = None


class RunHistoryResponse(BaseModel):
    data: list[RunHistoryItem]
    total_count: int
    has_next: bool


# --- Recent Run (for home screen) ---

class RecentRun(BaseModel):
    id: str
    distance_meters: int
    duration_seconds: int
    avg_pace_seconds_per_km: int | None
    started_at: datetime
    finished_at: datetime
    course: RunCourseInfo | None = None
    goal_data: dict | None = None


# --- Analytics ---

class WeeklyStatItem(BaseModel):
    week_start: str  # ISO date string "2026-02-24"
    distance_meters: int
    run_count: int
    duration_seconds: int
    avg_pace: int | None

class PaceTrendItem(BaseModel):
    date: str  # ISO datetime string
    avg_pace: int  # seconds per km
    distance_meters: int

class ActivityDay(BaseModel):
    date: str  # "2026-02-24"
    distance_meters: int
    run_count: int

class BestEffortItem(BaseModel):
    distance_label: str  # "1K", "5K", "10K", "Half", "Full"
    target_meters: int
    best_time_seconds: int | None = None
    best_pace: int | None = None  # seconds per km
    achieved_date: str | None = None
    run_id: str | None = None

class AnalyticsResponse(BaseModel):
    weekly_stats: list[WeeklyStatItem]
    pace_trend: list[PaceTrendItem]
    activity_calendar: list[ActivityDay]
    best_efforts: list[BestEffortItem]
    weekly_goal_km: float  # target
    weekly_current_km: float  # this week's actual
