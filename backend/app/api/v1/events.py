"""Event endpoints: list events, join/leave, map markers."""

from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.event import (
    EventListResponse,
    EventMapMarker,
    EventParticipantResponse,
    EventResponse,
)
from app.services.event_service import EventService

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=EventListResponse)
@inject
async def get_active_events(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(0, ge=0),
    per_page: int = Query(20, ge=1, le=100),
    event_service: EventService = Depends(Provide[Container.event_service]),
) -> EventListResponse:
    """Get paginated list of active events."""
    events, total_count = await event_service.get_active_events(
        db=db,
        page=page,
        per_page=per_page,
        current_user_id=current_user.id,
    )
    return EventListResponse(
        data=[EventResponse(**e) for e in events],
        total_count=total_count,
    )


@router.get("/map-markers", response_model=list[EventMapMarker])
@inject
async def get_event_map_markers(
    current_user: CurrentUser,
    db: DbSession,
    sw_lat: float = Query(..., description="South-west latitude"),
    sw_lng: float = Query(..., description="South-west longitude"),
    ne_lat: float = Query(..., description="North-east latitude"),
    ne_lng: float = Query(..., description="North-east longitude"),
    event_service: EventService = Depends(Provide[Container.event_service]),
) -> list[EventMapMarker]:
    """Get event markers within a map viewport bounding box."""
    markers = await event_service.get_event_map_markers(
        db=db,
        sw_lat=sw_lat,
        sw_lng=sw_lng,
        ne_lat=ne_lat,
        ne_lng=ne_lng,
    )
    return [EventMapMarker(**m) for m in markers]


@router.get("/{event_id}", response_model=EventResponse)
@inject
async def get_event(
    event_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    event_service: EventService = Depends(Provide[Container.event_service]),
) -> EventResponse:
    """Get event details."""
    event = await event_service.get_event_by_id(
        db=db,
        event_id=event_id,
        current_user_id=current_user.id,
    )
    return EventResponse(**event)


@router.post("/{event_id}/join", response_model=EventParticipantResponse, status_code=201)
@inject
async def join_event(
    event_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    event_service: EventService = Depends(Provide[Container.event_service]),
) -> EventParticipantResponse:
    """Join an event."""
    participant = await event_service.join_event(
        db=db,
        event_id=event_id,
        user_id=current_user.id,
    )
    return EventParticipantResponse(
        event_id=str(participant.event_id),
        user_id=str(participant.user_id),
        progress_distance_meters=participant.progress_distance_meters,
        progress_runs=participant.progress_runs,
        completed=participant.completed,
        joined_at=participant.joined_at,
    )


@router.delete("/{event_id}/join", status_code=204)
@inject
async def leave_event(
    event_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    event_service: EventService = Depends(Provide[Container.event_service]),
) -> None:
    """Leave an event."""
    await event_service.leave_event(
        db=db,
        event_id=event_id,
        user_id=current_user.id,
    )
