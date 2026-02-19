"""User profile and stats schemas."""

from datetime import date, datetime

from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    """Full user profile response."""
    id: str
    email: str | None
    nickname: str | None
    avatar_url: str | None
    birthday: date | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    bio: str | None = None
    instagram_username: str | None = None
    activity_region: str | None = None
    country: str | None = None
    total_distance_meters: int
    total_runs: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ProfileSetupRequest(BaseModel):
    """Initial profile setup after first login."""
    nickname: str = Field(..., min_length=2, max_length=12)
    avatar_url: str | None = None
    activity_region: str | None = Field(None, max_length=100)


class ProfileUpdateRequest(BaseModel):
    """Partial profile update."""
    nickname: str | None = Field(None, min_length=2, max_length=12)
    avatar_url: str | None = None
    birthday: date | None = None
    height_cm: float | None = Field(None, ge=50, le=300)
    weight_kg: float | None = Field(None, ge=20, le=500)
    bio: str | None = Field(None, max_length=100)
    instagram_username: str | None = Field(None, max_length=30)
    activity_region: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=50)


class ProfileResponse(BaseModel):
    """Profile update response."""
    id: str
    nickname: str | None
    avatar_url: str | None
    birthday: date | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    bio: str | None = None
    instagram_username: str | None = None
    activity_region: str | None = None
    country: str | None = None

    model_config = {"from_attributes": True}


class PublicProfileCourse(BaseModel):
    """Course summary for public profile."""
    id: str
    title: str
    distance_meters: int
    thumbnail_url: str | None
    total_runs: int = 0
    like_count: int = 0


class PublicProfileRanking(BaseModel):
    """Ranking entry for public profile."""
    course_id: str
    course_title: str
    rank: int
    best_duration_seconds: int


class PublicProfileGear(BaseModel):
    """Gear summary for public profile."""
    id: str
    brand: str
    model_name: str
    image_url: str | None = None
    is_primary: bool
    total_distance_meters: float


class PublicProfileResponse(BaseModel):
    """Public profile visible to other users."""
    id: str
    nickname: str | None
    avatar_url: str | None
    bio: str | None = None
    instagram_username: str | None = None
    activity_region: str | None = None
    total_distance_meters: int
    total_runs: int
    created_at: datetime
    # Follow info (set by the endpoint)
    followers_count: int = 0
    following_count: int = 0
    is_following: bool = False
    # Created courses
    courses: list[PublicProfileCourse] = []
    # Top rankings
    top_rankings: list[PublicProfileRanking] = []
    # Running gear
    primary_gear: PublicProfileGear | None = None
    gear_items: list[PublicProfileGear] = []


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


class SocialCountsResponse(BaseModel):
    """Social counts for the current user (followers, following, likes)."""
    followers_count: int = 0
    following_count: int = 0
    total_likes_received: int = 0


class WeeklyStats(BaseModel):
    """Weekly summary statistics for home screen."""
    total_distance_meters: int = 0
    total_duration_seconds: int = 0
    run_count: int = 0
    avg_pace_seconds_per_km: int | None = None
    compared_to_last_week_percent: float = 0.0
