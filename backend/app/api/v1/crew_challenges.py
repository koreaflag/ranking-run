"""Crew challenge (raid run) endpoints."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession, OptionalCurrentUser
from app.schemas.crew_challenge import (
    CrewChallengeCreateRequest,
    CrewChallengeHistoryResponse,
    CrewChallengeResponse,
    CrewCourseRankingListResponse,
)
from app.services.crew_challenge_service import CrewChallengeService
from app.services.crew_ranking_service import CrewRankingService

router = APIRouter(tags=["crew-challenges"])


# ------------------------------------------------------------------
# Crew Challenge CRUD
# ------------------------------------------------------------------


@router.post(
    "/crews/{crew_id}/challenges",
    response_model=CrewChallengeResponse,
    status_code=201,
)
@inject
async def create_challenge(
    crew_id: UUID,
    body: CrewChallengeCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    service: CrewChallengeService = Depends(
        Provide[Container.crew_challenge_service]
    ),
) -> CrewChallengeResponse:
    result = await service.create_challenge(
        db=db,
        crew_id=crew_id,
        course_id=body.course_id,
        user_id=current_user.id,
    )
    return CrewChallengeResponse(**result)


@router.get(
    "/crews/{crew_id}/challenges/active",
    response_model=CrewChallengeResponse | None,
)
@inject
async def get_active_challenge(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: CrewChallengeService = Depends(
        Provide[Container.crew_challenge_service]
    ),
) -> CrewChallengeResponse | None:
    result = await service.get_active_challenge(db=db, crew_id=crew_id)
    if result is None:
        return None
    return CrewChallengeResponse(**result)


@router.post(
    "/crews/{crew_id}/challenges/{challenge_id}/end",
    response_model=CrewChallengeResponse,
)
@inject
async def end_challenge(
    crew_id: UUID,
    challenge_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: CrewChallengeService = Depends(
        Provide[Container.crew_challenge_service]
    ),
) -> CrewChallengeResponse:
    result = await service.end_challenge(
        db=db,
        crew_id=crew_id,
        challenge_id=challenge_id,
        user_id=current_user.id,
    )
    return CrewChallengeResponse(**result)


@router.get(
    "/crews/{crew_id}/challenges/history",
    response_model=CrewChallengeHistoryResponse,
)
@inject
async def get_challenge_history(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(10, ge=1, le=50),
    service: CrewChallengeService = Depends(
        Provide[Container.crew_challenge_service]
    ),
) -> CrewChallengeHistoryResponse:
    result = await service.get_challenge_history(
        db=db,
        crew_id=crew_id,
        page=page,
        per_page=per_page,
    )
    return CrewChallengeHistoryResponse(**result)


# ------------------------------------------------------------------
# Crew Course Rankings (leaderboard)
# ------------------------------------------------------------------


@router.get(
    "/courses/{course_id}/crew-rankings",
    response_model=CrewCourseRankingListResponse,
)
@inject
async def get_course_crew_rankings(
    course_id: UUID,
    db: DbSession,
    current_user: OptionalCurrentUser = None,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    service: CrewRankingService = Depends(
        Provide[Container.crew_ranking_service]
    ),
) -> CrewCourseRankingListResponse:
    user_id = current_user.id if current_user else None
    result = await service.get_course_crew_rankings(
        db=db,
        course_id=course_id,
        page=page,
        per_page=per_page,
        requesting_user_id=user_id,
    )
    return CrewCourseRankingListResponse(**result)
