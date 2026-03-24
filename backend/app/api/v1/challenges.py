"""Challenge endpoints: list, detail, join."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.challenge import (
    ChallengeDetailResponse,
    ChallengeJoinRequest,
    ChallengeLeaderboardEntry,
    ChallengeListResponse,
    ChallengeParticipantProgress,
    ChallengeResponse,
)
from app.services.challenge_service import ChallengeService

router = APIRouter(prefix="/challenges", tags=["challenges"])


@router.get("", response_model=ChallengeListResponse)
@inject
async def list_active_challenges(
    current_user: CurrentUser,
    db: DbSession,
    challenge_service: ChallengeService = Depends(
        Provide[Container.challenge_service]
    ),
) -> ChallengeListResponse:
    """Get list of active challenges with user's progress."""
    challenges, total = await challenge_service.list_active(
        db=db, user_id=current_user.id
    )
    return ChallengeListResponse(
        data=[ChallengeResponse(**c) for c in challenges],
        total=total,
    )


@router.get("/{challenge_id}", response_model=ChallengeDetailResponse)
@inject
async def get_challenge_detail(
    challenge_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    challenge_service: ChallengeService = Depends(
        Provide[Container.challenge_service]
    ),
) -> ChallengeDetailResponse:
    """Get challenge detail with progress and leaderboard."""
    detail = await challenge_service.get_detail(
        db=db, challenge_id=challenge_id, user_id=current_user.id
    )
    return ChallengeDetailResponse(**detail)


@router.post(
    "/{challenge_id}/join",
    response_model=ChallengeResponse,
    status_code=201,
)
@inject
async def join_challenge(
    challenge_id: UUID,
    body: ChallengeJoinRequest,
    current_user: CurrentUser,
    db: DbSession,
    challenge_service: ChallengeService = Depends(
        Provide[Container.challenge_service]
    ),
) -> ChallengeResponse:
    """Join a challenge."""
    await challenge_service.join(
        db=db,
        challenge_id=challenge_id,
        user_id=current_user.id,
        crew_id=body.crew_id,
    )
    # Return refreshed challenge detail (without leaderboard)
    detail = await challenge_service.get_detail(
        db=db, challenge_id=challenge_id, user_id=current_user.id
    )
    return ChallengeResponse(**detail)
