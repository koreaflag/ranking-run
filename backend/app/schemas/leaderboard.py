"""Leaderboard schemas: weekly top runners."""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.ranking import RankingUserInfo


class WeeklyRunnerEntry(BaseModel):
    """A single runner's weekly aggregated stats."""

    rank: int
    user: RankingUserInfo
    total_distance_meters: int
    run_count: int
    total_duration_seconds: int


class WeeklyLeaderboardResponse(BaseModel):
    """Weekly leaderboard with optional user ranking."""

    data: list[WeeklyRunnerEntry]
    my_ranking: WeeklyRunnerEntry | None = None
    period_start: datetime
    period_end: datetime
