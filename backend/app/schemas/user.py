"""User profile and stats schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    """Full user profile response."""
    id: str
    email: str | None
    nickname: str | None
    avatar_url: str | None
    total_distance_meters: int
    total_runs: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ProfileSetupRequest(BaseModel):
    """Initial profile setup after first login."""
    nickname: str = Field(..., min_length=2, max_length=12)
    avatar_url: str | None = None


class ProfileUpdateRequest(BaseModel):
    """Partial profile update."""
    nickname: str | None = Field(None, min_length=2, max_length=12)
    avatar_url: str | None = None


class ProfileResponse(BaseModel):
    """Profile update response."""
    id: str
    nickname: str | None
    avatar_url: str | None

    model_config = {"from_attributes": True}


class MonthlyDistance(BaseModel):
    """Monthly distance aggregation."""
    month: str = Field(description="YYYY-MM format")
    distance_meters: int
    run_count: int


class UserStats(BaseModel):
    """Comprehensive user statistics."""
    # Period summary
    total_distance_meters: int = 0
    total_duration_seconds: int = 0
    total_runs: int = 0
    avg_pace_seconds_per_km: int | None = None
    avg_distance_per_run_meters: int = 0
    best_pace_seconds_per_km: int | None = None
    longest_run_meters: int = 0
    total_elevation_gain_meters: int = 0
    estimated_calories: int = 0

    # Streak
    current_streak_days: int = 0
    best_streak_days: int = 0

    # Course stats
    courses_created: int = 0
    courses_completed: int = 0
    total_course_runs: int = 0
    ranking_top10_count: int = 0

    # Monthly trend (last 6 months)
    monthly_distance: list[MonthlyDistance] = []


class WeeklyStats(BaseModel):
    """Weekly summary statistics for home screen."""
    total_distance_meters: int = 0
    total_duration_seconds: int = 0
    run_count: int = 0
    avg_pace_seconds_per_km: int | None = None
    compared_to_last_week_percent: float = 0.0
