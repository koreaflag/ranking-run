"""Leaderboard endpoints: weekly top runners."""

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import DbSession, OptionalCurrentUser
from app.schemas.leaderboard import (
    WeeklyLeaderboardResponse,
    WeeklyRunnerEntry,
)
from app.schemas.ranking import RankingUserInfo
from app.services.stats_service import StatsService

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("/weekly", response_model=WeeklyLeaderboardResponse)
@inject
async def get_weekly_leaderboard(
    db: DbSession,
    current_user: OptionalCurrentUser = None,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    region: str | None = Query(None),
    stats_service: StatsService = Depends(Provide[Container.stats_service]),
) -> WeeklyLeaderboardResponse:
    """Get weekly leaderboard ranked by total distance. Auth optional."""
    result = await stats_service.get_weekly_leaderboard(
        db=db,
        page=page,
        per_page=per_page,
        region=region or None,
        requesting_user_id=current_user.id if current_user else None,
    )

    data = [
        WeeklyRunnerEntry(
            rank=entry["rank"],
            user=RankingUserInfo(**entry["user"]),
            total_distance_meters=entry["total_distance_meters"],
            run_count=entry["run_count"],
            total_duration_seconds=entry["total_duration_seconds"],
        )
        for entry in result["data"]
    ]

    my_ranking = None
    if result["my_ranking"]:
        my_ranking = WeeklyRunnerEntry(
            rank=result["my_ranking"]["rank"],
            user=RankingUserInfo(**result["my_ranking"]["user"]),
            total_distance_meters=result["my_ranking"]["total_distance_meters"],
            run_count=result["my_ranking"]["run_count"],
            total_duration_seconds=result["my_ranking"]["total_duration_seconds"],
        )

    return WeeklyLeaderboardResponse(
        data=data,
        my_ranking=my_ranking,
        period_start=result["period_start"],
        period_end=result["period_end"],
    )
