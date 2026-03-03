"""In-memory WebSocket connection manager for crew chat."""

import logging
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections grouped by crew (event_id).

    Each crew room maintains a dict of user_id -> WebSocket.
    This is an in-memory, single-process manager. For horizontal scaling,
    replace broadcast_to_crew with a Redis pub/sub adapter.
    """

    def __init__(self) -> None:
        # event_id -> {user_id -> WebSocket}
        self.active_connections: dict[UUID, dict[UUID, WebSocket]] = {}

    async def connect(
        self,
        event_id: UUID,
        user_id: UUID,
        websocket: WebSocket,
    ) -> None:
        """Accept the WebSocket and register it in the crew room."""
        await websocket.accept()

        if event_id not in self.active_connections:
            self.active_connections[event_id] = {}

        # Close any existing connection for the same user in this crew
        existing = self.active_connections[event_id].get(user_id)
        if existing is not None:
            try:
                await existing.close(code=4001, reason="duplicate_connection")
            except Exception:
                pass

        self.active_connections[event_id][user_id] = websocket
        logger.info(
            "WS connected: event=%s user=%s (online: %d)",
            event_id,
            user_id,
            len(self.active_connections[event_id]),
        )

    def disconnect(self, event_id: UUID, user_id: UUID) -> None:
        """Remove a WebSocket from the crew room."""
        room = self.active_connections.get(event_id)
        if room is not None:
            room.pop(user_id, None)
            if not room:
                del self.active_connections[event_id]

        logger.info("WS disconnected: event=%s user=%s", event_id, user_id)

    async def broadcast_to_crew(
        self,
        event_id: UUID,
        message: dict,
        exclude_user: UUID | None = None,
    ) -> None:
        """Send a JSON message to all connected users in a crew room.

        Args:
            event_id: The crew room to broadcast to.
            message: JSON-serializable dict to send.
            exclude_user: Optional user_id to skip (e.g., the sender).
        """
        room = self.active_connections.get(event_id)
        if room is None:
            return

        disconnected: list[UUID] = []
        for uid, ws in room.items():
            if exclude_user is not None and uid == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(uid)

        # Clean up stale connections
        for uid in disconnected:
            room.pop(uid, None)
            logger.warning(
                "WS stale connection removed: event=%s user=%s",
                event_id,
                uid,
            )

    def get_online_users(self, event_id: UUID) -> list[UUID]:
        """Get list of user_ids currently connected to a crew room."""
        room = self.active_connections.get(event_id)
        if room is None:
            return []
        return list(room.keys())


# Singleton instance used across the application
ws_manager = ConnectionManager()
