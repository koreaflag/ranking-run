"""Crew join request endpoints: apply, approve, reject, cancel."""

import logging
from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.models.crew import Crew, CrewMember
from app.schemas.crew import (
    JoinRequestCreateRequest,
    JoinRequestListResponse,
    JoinRequestResponse,
    MyJoinRequestResponse,
)
from app.services.crew_join_request_service import CrewJoinRequestService
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/crews/{crew_id}/join-requests", tags=["crew-join-requests"])


@router.post("", response_model=JoinRequestResponse, status_code=201)
@inject
async def create_join_request(
    crew_id: UUID,
    body: JoinRequestCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    service: CrewJoinRequestService = Depends(
        Provide[Container.crew_join_request_service]
    ),
    notification_service: NotificationService = Depends(
        Provide[Container.notification_service]
    ),
) -> JoinRequestResponse:
    result = await service.create_request(
        db=db, crew_id=crew_id, user_id=current_user.id, message=body.message
    )

    # Notify crew owner + admins about the join request
    try:
        crew_result = await db.execute(
            select(Crew.name).where(Crew.id == crew_id)
        )
        crew_name = crew_result.scalar_one_or_none() or ""

        admins_result = await db.execute(
            select(CrewMember.user_id).where(
                CrewMember.crew_id == crew_id,
                CrewMember.role.in_(["owner", "admin"]),
            )
        )
        admin_ids = [row[0] for row in admins_result.all()]

        for admin_id in admin_ids:
            if admin_id == current_user.id:
                continue
            await notification_service.create_and_send(
                db=db,
                user_id=admin_id,
                notification_type="crew_join_request",
                actor_id=current_user.id,
                title=current_user.nickname or "누군가",
                body=f"님이 {crew_name}에 가입을 신청했습니다",
                target_id=str(crew_id),
                target_type="crew",
                data={"crew_name": crew_name, "request_id": result.get("id")},
            )
    except Exception:
        logger.warning("Failed to send join request notification for crew %s", crew_id)

    return JoinRequestResponse(**result)


@router.get("/my", response_model=MyJoinRequestResponse)
@inject
async def get_my_join_request(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: CrewJoinRequestService = Depends(
        Provide[Container.crew_join_request_service]
    ),
) -> MyJoinRequestResponse:
    result = await service.get_my_request(
        db=db, crew_id=crew_id, user_id=current_user.id
    )
    return MyJoinRequestResponse(**result)


@router.get("", response_model=JoinRequestListResponse)
@inject
async def list_pending_requests(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    service: CrewJoinRequestService = Depends(
        Provide[Container.crew_join_request_service]
    ),
) -> JoinRequestListResponse:
    requests, total = await service.get_pending_requests(
        db=db,
        crew_id=crew_id,
        reviewer_id=current_user.id,
        page=page,
        per_page=per_page,
    )
    return JoinRequestListResponse(
        data=[JoinRequestResponse(**r) for r in requests],
        total_count=total,
    )


@router.patch("/{request_id}/approve", response_model=JoinRequestResponse)
@inject
async def approve_join_request(
    crew_id: UUID,
    request_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: CrewJoinRequestService = Depends(
        Provide[Container.crew_join_request_service]
    ),
) -> JoinRequestResponse:
    result = await service.approve_request(
        db=db,
        crew_id=crew_id,
        request_id=request_id,
        reviewer_id=current_user.id,
    )
    return JoinRequestResponse(**result)


@router.patch("/{request_id}/reject", status_code=204)
@inject
async def reject_join_request(
    crew_id: UUID,
    request_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: CrewJoinRequestService = Depends(
        Provide[Container.crew_join_request_service]
    ),
) -> None:
    await service.reject_request(
        db=db,
        crew_id=crew_id,
        request_id=request_id,
        reviewer_id=current_user.id,
    )


@router.delete("/{request_id}", status_code=204)
@inject
async def cancel_join_request(
    crew_id: UUID,
    request_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: CrewJoinRequestService = Depends(
        Provide[Container.crew_join_request_service]
    ),
) -> None:
    await service.cancel_request(
        db=db,
        crew_id=crew_id,
        request_id=request_id,
        user_id=current_user.id,
    )


@router.get("/count")
@inject
async def get_pending_count(
    crew_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    service: CrewJoinRequestService = Depends(
        Provide[Container.crew_join_request_service]
    ),
) -> dict:
    count = await service.get_pending_count(db=db, crew_id=crew_id)
    return {"count": count}
