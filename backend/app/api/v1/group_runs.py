"""Group run endpoints: create, invite, accept, leave, rankings."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession, OptionalCurrentUser
from app.schemas.group_run import (
    GroupRankingListResponse,
    GroupRunCreateRequest,
    GroupRunInviteRequest,
    GroupRunListResponse,
    GroupRunResponse,
)
from app.services.group_ranking_service import GroupRankingService
from app.services.group_run_service import GroupRunService

router = APIRouter(tags=["group-runs"])


# ------------------------------------------------------------------
# Group Run CRUD
# ------------------------------------------------------------------


@router.post("/group-runs", response_model=GroupRunResponse, status_code=201)
@inject
async def create_group_run(
    body: GroupRunCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    service: GroupRunService = Depends(Provide[Container.group_run_service]),
) -> GroupRunResponse:
    result = await service.create_group_run(
        db=db,
        course_id=body.course_id,
        name=body.name,
        creator_id=current_user.id,
        invite_user_ids=body.invite_user_ids,
    )
    return GroupRunResponse(**result)


@router.get("/group-runs/my", response_model=GroupRunListResponse)
@inject
async def get_my_group_runs(
    current_user: CurrentUser,
    db: DbSession,
    course_id: UUID | None = Query(None),
    service: GroupRunService = Depends(Provide[Container.group_run_service]),
) -> GroupRunListResponse:
    data = await service.get_my_group_runs(
        db=db, user_id=current_user.id, course_id=course_id
    )
    return GroupRunListResponse(data=[GroupRunResponse(**d) for d in data], total_count=len(data))


@router.get("/group-runs/{group_run_id}", response_model=GroupRunResponse)
@inject
async def get_group_run(
    group_run_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: GroupRunService = Depends(Provide[Container.group_run_service]),
) -> GroupRunResponse:
    result = await service.get_group_run(
        db=db, group_run_id=group_run_id, requesting_user_id=current_user.id
    )
    return GroupRunResponse(**result)


@router.post("/group-runs/{group_run_id}/accept", response_model=GroupRunResponse)
@inject
async def accept_invite(
    group_run_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: GroupRunService = Depends(Provide[Container.group_run_service]),
) -> GroupRunResponse:
    result = await service.accept_invite(
        db=db, group_run_id=group_run_id, user_id=current_user.id
    )
    return GroupRunResponse(**result)


@router.post("/group-runs/{group_run_id}/decline", status_code=204)
@inject
async def decline_invite(
    group_run_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: GroupRunService = Depends(Provide[Container.group_run_service]),
) -> None:
    await service.decline_invite(
        db=db, group_run_id=group_run_id, user_id=current_user.id
    )


@router.post("/group-runs/{group_run_id}/invite", response_model=GroupRunResponse)
@inject
async def invite_members(
    group_run_id: UUID,
    body: GroupRunInviteRequest,
    current_user: CurrentUser,
    db: DbSession,
    service: GroupRunService = Depends(Provide[Container.group_run_service]),
) -> GroupRunResponse:
    result = await service.invite_members(
        db=db,
        group_run_id=group_run_id,
        user_id=current_user.id,
        invite_user_ids=body.user_ids,
    )
    return GroupRunResponse(**result)


@router.post("/group-runs/{group_run_id}/leave", status_code=204)
@inject
async def leave_group(
    group_run_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: GroupRunService = Depends(Provide[Container.group_run_service]),
) -> None:
    await service.leave_group(
        db=db, group_run_id=group_run_id, user_id=current_user.id
    )


@router.delete("/group-runs/{group_run_id}", status_code=204)
@inject
async def disband_group(
    group_run_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: GroupRunService = Depends(Provide[Container.group_run_service]),
) -> None:
    await service.disband_group(
        db=db, group_run_id=group_run_id, user_id=current_user.id
    )


# ------------------------------------------------------------------
# Group Rankings (on courses)
# ------------------------------------------------------------------


@router.get(
    "/courses/{course_id}/group-rankings",
    response_model=GroupRankingListResponse,
)
@inject
async def get_course_group_rankings(
    course_id: UUID,
    db: DbSession,
    current_user: OptionalCurrentUser = None,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    service: GroupRankingService = Depends(
        Provide[Container.group_ranking_service]
    ),
) -> GroupRankingListResponse:
    user_id = current_user.id if current_user else None
    result = await service.get_course_group_rankings(
        db=db,
        course_id=course_id,
        page=page,
        per_page=per_page,
        requesting_user_id=user_id,
    )
    return GroupRankingListResponse(**result)
