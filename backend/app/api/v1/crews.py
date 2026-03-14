"""Crew endpoints: CRUD, membership, role management."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from pydantic import BaseModel

from app.schemas.crew import (
    CrewCreateRequest,
    CrewGradeUpdateRequest,
    CrewInviteByCodeRequest,
    CrewListResponse,
    CrewManagementStats,
    CrewMemberListResponse,
    CrewMemberResponse,
    CrewResponse,
    CrewRoleUpdateRequest,
    CrewUpdateRequest,
    CrewWeeklyRankingItem,
    CrewWeeklyRankingResponse,
)


class SetPrimaryCrewRequest(BaseModel):
    crew_id: str
from app.services.crew_service import CrewService

router = APIRouter(prefix="/crews", tags=["crews"])


# ------------------------------------------------------------------
# Crew CRUD
# ------------------------------------------------------------------


@router.post("", response_model=CrewResponse, status_code=201)
@inject
async def create_crew(
    body: CrewCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewResponse:
    crew = await crew_service.create_crew(
        db=db, user_id=current_user.id, data=body.model_dump()
    )
    return CrewResponse(**crew)


@router.get("", response_model=CrewListResponse)
@inject
async def list_crews(
    current_user: CurrentUser,
    db: DbSession,
    search: str | None = Query(None),
    region: str | None = Query(None),
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewListResponse:
    crews, total = await crew_service.list_crews(
        db=db,
        current_user_id=current_user.id,
        search=search,
        region=region,
        page=page,
        per_page=per_page,
    )
    return CrewListResponse(
        data=[CrewResponse(**c) for c in crews],
        total_count=total,
    )


@router.get("/my", response_model=list[CrewResponse])
@inject
async def list_my_crews(
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> list[CrewResponse]:
    crews = await crew_service.list_my_crews(db=db, user_id=current_user.id)
    return [CrewResponse(**c) for c in crews]


@router.put("/my/primary")
@inject
async def set_primary_crew(
    body: SetPrimaryCrewRequest,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> dict:
    """Set the user's primary crew displayed on profile."""
    crew_name = await crew_service.set_primary_crew(
        db=db, user_id=current_user.id, crew_id=UUID(body.crew_id)
    )
    return {"crew_name": crew_name}


@router.get("/{crew_id}", response_model=CrewResponse)
@inject
async def get_crew(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewResponse:
    crew = await crew_service.get_crew(
        db=db, crew_id=crew_id, current_user_id=current_user.id
    )
    return CrewResponse(**crew)


@router.patch("/{crew_id}", response_model=CrewResponse)
@inject
async def update_crew(
    crew_id: UUID,
    body: CrewUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewResponse:
    crew = await crew_service.update_crew(
        db=db,
        crew_id=crew_id,
        user_id=current_user.id,
        data=body.model_dump(exclude_unset=True),
    )
    return CrewResponse(**crew)


@router.delete("/{crew_id}", status_code=204)
@inject
async def delete_crew(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> None:
    await crew_service.delete_crew(
        db=db, crew_id=crew_id, user_id=current_user.id
    )


# ------------------------------------------------------------------
# Membership
# ------------------------------------------------------------------


@router.post("/{crew_id}/join", response_model=CrewResponse)
@inject
async def join_crew(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewResponse:
    crew = await crew_service.join_crew(
        db=db, crew_id=crew_id, user_id=current_user.id
    )
    return CrewResponse(**crew)


@router.post("/{crew_id}/invite", response_model=CrewMemberResponse, status_code=201)
@inject
async def invite_by_code(
    crew_id: UUID,
    body: CrewInviteByCodeRequest,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewMemberResponse:
    """Invite a user to the crew by their unique user_code."""
    member = await crew_service.invite_by_code(
        db=db,
        crew_id=crew_id,
        actor_user_id=current_user.id,
        user_code=body.user_code,
    )
    return CrewMemberResponse(**member)


@router.post("/{crew_id}/leave", status_code=204)
@inject
async def leave_crew(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> None:
    await crew_service.leave_crew(
        db=db, crew_id=crew_id, user_id=current_user.id
    )


@router.get("/{crew_id}/members", response_model=CrewMemberListResponse)
@inject
async def get_members(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(50, ge=1, le=100),
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewMemberListResponse:
    members, total = await crew_service.get_members(
        db=db, crew_id=crew_id, page=page, per_page=per_page
    )
    return CrewMemberListResponse(
        data=[CrewMemberResponse(**m) for m in members],
        total_count=total,
    )


@router.patch(
    "/{crew_id}/members/{user_id}/role",
    response_model=CrewMemberResponse,
)
@inject
async def update_member_role(
    crew_id: UUID,
    user_id: UUID,
    body: CrewRoleUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewMemberResponse:
    member = await crew_service.update_member_role(
        db=db,
        crew_id=crew_id,
        target_user_id=user_id,
        actor_user_id=current_user.id,
        new_role=body.role,
    )
    return CrewMemberResponse(**member)


@router.delete("/{crew_id}/members/{user_id}", status_code=204)
@inject
async def kick_member(
    crew_id: UUID,
    user_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> None:
    await crew_service.kick_member(
        db=db,
        crew_id=crew_id,
        target_user_id=user_id,
        actor_user_id=current_user.id,
    )


@router.patch(
    "/{crew_id}/members/{user_id}/grade",
    response_model=CrewMemberResponse,
)
@inject
async def update_member_grade(
    crew_id: UUID,
    user_id: UUID,
    body: CrewGradeUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewMemberResponse:
    result = await crew_service.update_member_grade(
        db=db,
        crew_id=crew_id,
        target_user_id=user_id,
        actor_user_id=current_user.id,
        new_grade_level=body.grade_level,
    )
    return CrewMemberResponse(**result)


@router.get(
    "/{crew_id}/management/stats",
    response_model=CrewManagementStats,
)
@inject
async def get_management_stats(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewManagementStats:
    result = await crew_service.get_management_stats(
        db=db, crew_id=crew_id, user_id=current_user.id
    )
    return CrewManagementStats(**result)


@router.get(
    "/{crew_id}/weekly-ranking",
    response_model=CrewWeeklyRankingResponse,
)
@inject
async def get_weekly_ranking(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    crew_service: CrewService = Depends(Provide[Container.crew_service]),
) -> CrewWeeklyRankingResponse:
    """Get this week's distance ranking for crew members."""
    rows = await crew_service.get_weekly_ranking(db=db, crew_id=crew_id)
    return CrewWeeklyRankingResponse(
        data=[CrewWeeklyRankingItem(**r) for r in rows],
    )
