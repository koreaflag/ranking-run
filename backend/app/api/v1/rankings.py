"""Ranking endpoints: course leaderboards, personal ranking, personal best."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFoundError
from app.schemas.ranking import (
    MyBestResponse,
    MyRankingInfo,
    MyRankingResponse,
    RankingEntry,
    RankingListResponse,
    RankingUserInfo,
)
from app.services.course_service import CourseService
from app.services.ranking_service import RankingService

router = APIRouter(prefix="/courses", tags=["rankings"])


@router.get("/{course_id}/rankings", response_model=RankingListResponse)
@inject
async def get_course_rankings(
    course_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    limit: int | None = Query(None, ge=1, le=100),
    course_service: CourseService = Depends(Provide[Container.course_service]),
    ranking_service: RankingService = Depends(Provide[Container.ranking_service]),
) -> RankingListResponse:
    """Get the leaderboard for a specific course."""
    course = await course_service.get_course_by_id(db, course_id)
    if course is None:
        raise NotFoundError(code="NOT_FOUND", message="Course not found")

    actual_per_page = limit if limit is not None else per_page
    result = await ranking_service.get_course_rankings(
        db=db,
        course_id=course_id,
        page=page,
        per_page=actual_per_page,
        requesting_user_id=current_user.id,
    )

    data = [
        RankingEntry(
            rank=entry["rank"],
            user=RankingUserInfo(**entry["user"]),
            best_duration_seconds=entry["best_duration_seconds"],
            best_pace_seconds_per_km=entry["best_pace_seconds_per_km"],
            run_count=entry["run_count"],
            achieved_at=entry["achieved_at"],
        )
        for entry in result["data"]
    ]

    my_ranking = None
    if result["my_ranking"]:
        my_ranking = MyRankingInfo(**result["my_ranking"])

    return RankingListResponse(
        data=data,
        my_ranking=my_ranking,
        total_runners=result["total_runners"],
    )


@router.get("/{course_id}/my-ranking", response_model=MyRankingResponse)
@inject
async def get_my_ranking(
    course_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    course_service: CourseService = Depends(Provide[Container.course_service]),
    ranking_service: RankingService = Depends(Provide[Container.ranking_service]),
) -> MyRankingResponse:
    """Get the current user's ranking on a specific course."""
    course = await course_service.get_course_by_id(db, course_id)
    if course is None:
        raise NotFoundError(code="NOT_FOUND", message="Course not found")

    result = await ranking_service.get_my_ranking(db, course_id, current_user.id)
    return MyRankingResponse(**result)


@router.get("/{course_id}/my-best", response_model=MyBestResponse | None)
@inject
async def get_my_best(
    course_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    course_service: CourseService = Depends(Provide[Container.course_service]),
    ranking_service: RankingService = Depends(Provide[Container.ranking_service]),
) -> MyBestResponse | None:
    """Get the current user's personal best record on a course."""
    course = await course_service.get_course_by_id(db, course_id)
    if course is None:
        raise NotFoundError(code="NOT_FOUND", message="Course not found")

    result = await ranking_service.get_my_best(db, course_id, current_user.id)
    if result is None:
        return None

    return MyBestResponse(**result)
