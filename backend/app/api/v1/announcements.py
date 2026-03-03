"""Announcement endpoints: public listing and admin creation."""

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.announcement import (
    AnnouncementCreateRequest,
    AnnouncementListResponse,
    AnnouncementResponse,
)
from app.services.announcement_service import AnnouncementService

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get("", response_model=AnnouncementListResponse)
@inject
async def get_announcements(
    db: DbSession,
    limit: int = Query(10, ge=1, le=50),
    service: AnnouncementService = Depends(
        Provide[Container.announcement_service]
    ),
) -> AnnouncementListResponse:
    items = await service.get_active(db=db, limit=limit)
    return AnnouncementListResponse(
        data=[AnnouncementResponse(**a) for a in items]
    )


@router.post("", response_model=AnnouncementResponse, status_code=201)
@inject
async def create_announcement(
    body: AnnouncementCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    service: AnnouncementService = Depends(
        Provide[Container.announcement_service]
    ),
) -> AnnouncementResponse:
    result = await service.create(db=db, data=body.model_dump())
    return AnnouncementResponse(**result)
