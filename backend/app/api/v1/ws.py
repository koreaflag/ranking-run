"""WebSocket endpoint for real-time crew chat."""

import logging
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError
from sqlalchemy import select

from app.core.security import decode_access_token
from app.core.ws_manager import ws_manager
from app.db.session import async_session_factory
from app.models.crew_message import CrewMessage
from app.models.event import EventParticipant
from app.models.user import User

logger = logging.getLogger(__name__)

ws_router = APIRouter()


async def _authenticate_ws(token: str) -> UUID | None:
    """Validate JWT from query param and return user_id or None."""
    try:
        payload = decode_access_token(token)
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
        return UUID(user_id_str)
    except (JWTError, ValueError):
        return None


async def _verify_membership(event_id: UUID, user_id: UUID) -> bool:
    """Check if user is a participant of the event."""
    async with async_session_factory() as db:
        result = await db.execute(
            select(EventParticipant.id).where(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
            )
        )
        return result.scalar_one_or_none() is not None


async def _get_user_info(user_id: UUID) -> dict | None:
    """Fetch nickname and avatar for a user."""
    async with async_session_factory() as db:
        result = await db.execute(
            select(User.nickname, User.avatar_url).where(User.id == user_id)
        )
        row = result.one_or_none()
        if row is None:
            return None
        return {"nickname": row[0], "avatar_url": row[1]}


async def _save_message(
    event_id: UUID,
    user_id: UUID,
    content: str,
    message_type: str = "text",
) -> dict | None:
    """Persist a chat message and return its dict representation."""
    async with async_session_factory() as db:
        try:
            message = CrewMessage(
                event_id=event_id,
                user_id=user_id,
                content=content,
                message_type=message_type,
            )
            db.add(message)
            await db.commit()
            await db.refresh(message)

            user_info = await _get_user_info(user_id)

            return {
                "type": "message",
                "id": str(message.id),
                "event_id": str(message.event_id),
                "user_id": str(message.user_id),
                "nickname": user_info["nickname"] if user_info else None,
                "avatar_url": user_info["avatar_url"] if user_info else None,
                "content": message.content,
                "message_type": message.message_type,
                "created_at": message.created_at.isoformat(),
            }
        except Exception:
            await db.rollback()
            logger.exception("Failed to save WS message")
            return None


def _build_members_online_message(event_id: UUID) -> dict:
    """Build a members_online event payload."""
    online_users = ws_manager.get_online_users(event_id)
    return {
        "type": "members_online",
        "event_id": str(event_id),
        "user_ids": [str(uid) for uid in online_users],
        "count": len(online_users),
    }


@ws_router.websocket("/api/v1/ws/crew/{event_id}")
async def crew_chat_ws(
    websocket: WebSocket,
    event_id: UUID,
    token: str = Query(...),
) -> None:
    """WebSocket endpoint for real-time crew chat.

    Connection flow:
    1. Validate JWT from ?token= query param.
    2. Verify user is a participant of the event.
    3. Accept connection and broadcast updated members_online.
    4. Message loop: receive JSON -> save to DB -> broadcast.
    5. On disconnect: broadcast updated members_online.

    Client sends: {"content": "...", "message_type": "text"}
    Server broadcasts: {"type": "message", "id": "...", ...}
    """
    # Authenticate
    user_id = await _authenticate_ws(token)
    if user_id is None:
        await websocket.close(code=4001, reason="invalid_token")
        return

    # Verify membership
    is_member = await _verify_membership(event_id, user_id)
    if not is_member:
        await websocket.close(code=4003, reason="not_a_member")
        return

    # Connect
    await ws_manager.connect(event_id, user_id, websocket)

    try:
        # Broadcast updated online members
        online_msg = _build_members_online_message(event_id)
        await ws_manager.broadcast_to_crew(event_id, online_msg)

        # Message loop
        while True:
            data = await websocket.receive_json()

            content = data.get("content", "").strip()
            if not content:
                continue

            message_type = data.get("message_type", "text")
            if message_type not in ("text", "image"):
                message_type = "text"

            # Save to database
            message_dict = await _save_message(
                event_id=event_id,
                user_id=user_id,
                content=content,
                message_type=message_type,
            )

            if message_dict is not None:
                # Broadcast to all crew members (including sender)
                await ws_manager.broadcast_to_crew(event_id, message_dict)

    except WebSocketDisconnect:
        logger.info(
            "WS client disconnected: event=%s user=%s", event_id, user_id
        )
    except Exception:
        logger.exception(
            "WS error: event=%s user=%s", event_id, user_id
        )
    finally:
        ws_manager.disconnect(event_id, user_id)

        # Broadcast updated online members
        online_msg = _build_members_online_message(event_id)
        await ws_manager.broadcast_to_crew(event_id, online_msg)
