"""Run session, chunk, and record schemas."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# --- Device Info ---

class DeviceInfo(BaseModel):
    platform: str = Field(description="android or ios")
    os_version: str
    device_model: str
    app_version: str


# --- GPS Points ---

class RawGPSPoint(BaseModel):
    lat: float
    lng: float
    alt: float = 0.0
    speed: float = 0.0
    bearing: float = 0.0
    accuracy: float = 0.0
    timestamp: int = Field(description="Unix timestamp in milliseconds")


class FilteredPoint(BaseModel):
    lat: float
    lng: float
    alt: float = 0.0
    speed: float = 0.0
    bearing: float = 0.0
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
    sequence: int = Field(..., ge=0)
    chunk_type: str = Field(
        ...,
        pattern="^(intermediate|final)$",
        description="intermediate or final",
    )
    raw_gps_points: list[RawGPSPoint]
    filtered_points: list[FilteredPoint] | None = None
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


class RunCompleteRequest(BaseModel):
    distance_meters: int = Field(..., ge=0)
    duration_seconds: int = Field(..., ge=0)
    total_elapsed_seconds: int | None = None
    avg_pace_seconds_per_km: int | None = None
    best_pace_seconds_per_km: int | None = None
    avg_speed_ms: float | None = None
    max_speed_ms: float | None = None
    calories: int | None = None
    finished_at: datetime

    route_geometry: GeoJSONLineString
    elevation_gain_meters: int = 0
    elevation_loss_meters: int = 0
    elevation_profile: list[float] = []

    splits: list[RunSplitDetail] = []
    pause_intervals: list[PauseInterval] = []

    course_completion: CourseCompletionInfo | None = None
    filter_config: FilterConfig | None = None

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


class RunCompleteResponse(BaseModel):
    run_record_id: str
    ranking: RankingInfo | None = None
    is_flagged: bool = False
    flag_reason: str | None = None
    user_stats_update: UserStatsUpdate
    missing_chunk_sequences: list[int] = []


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
