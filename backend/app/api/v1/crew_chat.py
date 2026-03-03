"""Crew chat endpoints: message history, send, read receipts, unread counts."""

from datetime import datetime
from uuid import UUID

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query

from app.core.container import Container
from app.core.deps import CurrentUser, DbSession
from app.schemas.crew_chat import (
    CrewAllUnreadResponse,
    CrewMessageCreateRequest,
    CrewMessageListResponse,
    CrewMessageResponse,
    CrewReadResponse,
    CrewUnreadItem,
)
from app.services.crew_chat_service import CrewChatService

router = APIRouter(prefix="/crews", tags=["crew-chat"])


@router.get("/my-unread", response_model=CrewAllUnreadResponse)
@inject
async def get_all_unread_counts(
    current_user: CurrentUser,
    db: DbSession,
    crew_chat_service: CrewChatService = Depends(
        Provide[Container.crew_chat_service]
    ),
) -> CrewAllUnreadResponse:
    """Get unread message counts across all crews the user is in."""
    items = await crew_chat_service.get_all_unread_counts(
        db=db, user_id=current_user.id
    )
    return CrewAllUnreadResponse(
        data=[CrewUnreadItem(**item) for item in items]
    )


@router.get(
    "/{event_id}/chat/messages", response_model=CrewMessageListResponse
)
@inject
async def get_messages(
    event_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    before: datetime | None = Query(
        None, description="Cursor: return messages before this timestamp"
    ),
    limit: int = Query(50, ge=1, le=100),
    crew_chat_service: CrewChatService = Depends(
        Provide[Container.crew_chat_service]
    ),
) -> CrewMessageListResponse:
    """Get crew chat message history with cursor-based pagination."""
    await crew_chat_service.verify_membership(
        db=db, event_id=event_id, user_id=current_user.id
    )

    messages, has_more = await crew_chat_service.get_messages(
        db=db, event_id=event_id, before=before, limit=limit
    )
    return CrewMessageListResponse(
        data=[CrewMessageResponse(**m) for m in messages],
        has_more=has_more,
    )


@router.post(
    "/{event_id}/chat/messages",
    response_model=CrewMessageResponse,
    status_code=201,
)
@inject
async def send_message(
    event_id: UUID,
    body: CrewMessageCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
    crew_chat_service: CrewChatService = Depends(
        Provide[Container.crew_chat_service]
    ),
) -> CrewMessageResponse:
    """Send a chat message to a crew via REST (fallback when WS is unavailable)."""
    await crew_chat_service.verify_membership(
        db=db, event_id=event_id, user_id=current_user.id
    )

    message = await crew_chat_service.create_message(
        db=db,
        event_id=event_id,
        user_id=current_user.id,
        content=body.content,
        message_type=body.message_type,
    )
    return CrewMessageResponse(**message)


@router.post(
    "/{event_id}/chat/read", response_model=CrewReadResponse
)
@inject
async def mark_as_read(
    event_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    crew_chat_service: CrewChatService = Depends(
        Provide[Container.crew_chat_service]
    ),
) -> CrewReadResponse:
    """Mark all messages in a crew as read for the current user."""
    await crew_chat_service.verify_membership(
        db=db, event_id=event_id, user_id=current_user.id
    )

    last_read_at = await crew_chat_service.mark_as_read(
        db=db, event_id=event_id, user_id=current_user.id
    )
    return CrewReadResponse(last_read_at=last_read_at)
