"""Challenge request/response schemas."""

from datetime import datetime

from pydantic import BaseModel


class ChallengeParticipantProgress(BaseModel):
    """User's progress in a challenge."""
    current_value: int
    goal_value: int
    progress_percent: float
    is_completed: bool


class ChallengeLeaderboardEntry(BaseModel):
    """Single entry in a challenge leaderboard."""
    user_id: str
    nickname: str | None
    avatar_url: str | None
    current_value: int
    is_completed: bool
    rank: int


class ChallengeResponse(BaseModel):
    """Single challenge in responses."""
    id: str
    title: str
    description: str | None
    challenge_type: str
    goal_value: int
    reward_points: int
    start_at: datetime
    end_at: datetime
    is_active: bool
    participant_count: int = 0
    my_progress: ChallengeParticipantProgress | None = None


class ChallengeDetailResponse(ChallengeResponse):
    """Challenge detail with leaderboard."""
    leaderboard: list[ChallengeLeaderboardEntry] = []


class ChallengeListResponse(BaseModel):
    """Paginated challenge list response."""
    data: list[ChallengeResponse]
    total: int


class ChallengeJoinRequest(BaseModel):
    """Request body to join a challenge."""
    crew_id: str | None = None
