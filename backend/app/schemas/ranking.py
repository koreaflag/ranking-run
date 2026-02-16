"""Ranking schemas for course leaderboards."""

from datetime import datetime

from pydantic import BaseModel


class RankingUserInfo(BaseModel):
    """User info embedded in ranking entries."""
    id: str
    nickname: str | None
    avatar_url: str | None


class RankingEntry(BaseModel):
    """Single ranking entry."""
    rank: int
    user: RankingUserInfo
    best_duration_seconds: int
    best_pace_seconds_per_km: int
    run_count: int = 1
    achieved_at: datetime


class MyRankingInfo(BaseModel):
    """Current user's ranking info."""
    rank: int
    best_duration_seconds: int
    best_pace_seconds_per_km: int


class RankingListResponse(BaseModel):
    """Paginated ranking list with user's own ranking."""
    data: list[RankingEntry]
    my_ranking: MyRankingInfo | None = None
    total_runners: int


class MyRankingResponse(BaseModel):
    """Quick-lookup response for user's ranking on a course."""
    rank: int | None
    best_duration_seconds: int | None
    total_runners: int
    percentile: float | None = None


class MyBestResponse(BaseModel):
    """User's personal best on a course."""
    id: str
    duration_seconds: int
    avg_pace_seconds_per_km: int | None
    finished_at: datetime
