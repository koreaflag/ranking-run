"""Crew chat service: messaging, read receipts, unread counts."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models.crew_message import CrewMessage, CrewMessageRead
from app.models.event import Event, EventParticipant


class CrewChatService:
    """Handles crew chat messaging, read tracking, and unread counts."""

    async def verify_membership(
        self,
        db: AsyncSession,
        event_id: UUID,
        user_id: UUID,
    ) -> None:
        """Verify user is a participant of the event.

        Raises:
            NotFoundError: Event does not exist.
            PermissionDeniedError: User is not a participant.
        """
        event_result = await db.execute(
            select(Event.id).where(Event.id == event_id)
        )
        if event_result.scalar_one_or_none() is None:
            raise NotFoundError(
                code="NOT_FOUND", message="크루를 찾을 수 없습니다"
            )

        participant_result = await db.execute(
            select(EventParticipant.id).where(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
            )
        )
        if participant_result.scalar_one_or_none() is None:
            raise PermissionDeniedError(
                code="NOT_MEMBER", message="크루 멤버만 채팅에 참여할 수 있습니다"
            )

    async def get_messages(
        self,
        db: AsyncSession,
        event_id: UUID,
        before: datetime | None = None,
        limit: int = 50,
    ) -> tuple[list[dict], bool]:
        """Get chat messages with cursor-based pagination (newest first).

        Args:
            db: Database session.
            event_id: The crew/event ID.
            before: Cursor -- only return messages created before this timestamp.
            limit: Max number of messages to return.

        Returns:
            Tuple of (message dicts, has_more).
        """
        filters = [CrewMessage.event_id == event_id]
        if before is not None:
            filters.append(CrewMessage.created_at < before)

        # Fetch one extra to determine has_more
        result = await db.execute(
            select(CrewMessage)
            .where(*filters)
            .order_by(CrewMessage.created_at.desc())
            .limit(limit + 1)
        )
        rows = result.scalars().all()

        has_more = len(rows) > limit
        messages = rows[:limit]

        return [self._message_to_dict(m) for m in messages], has_more

    async def create_message(
        self,
        db: AsyncSession,
        event_id: UUID,
        user_id: UUID,
        content: str,
        message_type: str = "text",
    ) -> dict:
        """Create a chat message and return enriched dict.

        Args:
            db: Database session.
            event_id: The crew/event ID.
            user_id: The sender's user ID.
            content: Message text.
            message_type: One of text, image, system.

        Returns:
            Enriched message dict with nickname/avatar.
        """
        message = CrewMessage(
            event_id=event_id,
            user_id=user_id,
            content=content,
            message_type=message_type,
        )
        db.add(message)
        await db.flush()
        await db.refresh(message)

        return self._message_to_dict(message)

    async def create_system_message(
        self,
        db: AsyncSession,
        event_id: UUID,
        content: str,
    ) -> dict:
        """Create a system message (no user_id).

        Args:
            db: Database session.
            event_id: The crew/event ID.
            content: System message text.

        Returns:
            Message dict with user_id=None.
        """
        message = CrewMessage(
            event_id=event_id,
            user_id=None,
            content=content,
            message_type="system",
        )
        db.add(message)
        await db.flush()
        await db.refresh(message)

        return self._message_to_dict(message)

    async def mark_as_read(
        self,
        db: AsyncSession,
        event_id: UUID,
        user_id: UUID,
    ) -> datetime:
        """Upsert crew_message_reads to mark messages as read.

        Returns:
            The new last_read_at timestamp.
        """
        now = datetime.now(timezone.utc)

        stmt = pg_insert(CrewMessageRead).values(
            event_id=event_id,
            user_id=user_id,
            last_read_at=now,
        )
        stmt = stmt.on_conflict_on_constraint("uq_crew_message_read").do_update(
            set_={"last_read_at": now}
        )
        await db.execute(stmt)
        await db.flush()

        return now

    async def get_unread_count(
        self,
        db: AsyncSession,
        event_id: UUID,
        user_id: UUID,
    ) -> int:
        """Count messages created after the user's last_read_at.

        Args:
            db: Database session.
            event_id: The crew/event ID.
            user_id: The user to check unread count for.

        Returns:
            Number of unread messages.
        """
        # Get last read timestamp
        read_result = await db.execute(
            select(CrewMessageRead.last_read_at).where(
                CrewMessageRead.event_id == event_id,
                CrewMessageRead.user_id == user_id,
            )
        )
        last_read_at = read_result.scalar_one_or_none()

        filters = [CrewMessage.event_id == event_id]
        if last_read_at is not None:
            filters.append(CrewMessage.created_at > last_read_at)

        count_result = await db.execute(
            select(func.count(CrewMessage.id)).where(*filters)
        )
        return count_result.scalar_one()

    async def get_all_unread_counts(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> list[dict]:
        """Get unread counts for all crews the user is participating in.

        Returns:
            List of dicts: [{event_id, title, unread_count}].
        """
        # Get all events the user is in
        participation_result = await db.execute(
            select(EventParticipant.event_id).where(
                EventParticipant.user_id == user_id
            )
        )
        event_ids = [row[0] for row in participation_result.all()]

        if not event_ids:
            return []

        # Batch-load event titles
        events_result = await db.execute(
            select(Event.id, Event.title).where(Event.id.in_(event_ids))
        )
        event_titles = {row[0]: row[1] for row in events_result.all()}

        # Batch-load last_read_at per event
        reads_result = await db.execute(
            select(
                CrewMessageRead.event_id,
                CrewMessageRead.last_read_at,
            ).where(
                CrewMessageRead.user_id == user_id,
                CrewMessageRead.event_id.in_(event_ids),
            )
        )
        last_reads = {row[0]: row[1] for row in reads_result.all()}

        # Count unread messages per event
        items = []
        for eid in event_ids:
            last_read_at = last_reads.get(eid)

            filters = [CrewMessage.event_id == eid]
            if last_read_at is not None:
                filters.append(CrewMessage.created_at > last_read_at)

            count_result = await db.execute(
                select(func.count(CrewMessage.id)).where(*filters)
            )
            unread = count_result.scalar_one()

            items.append(
                {
                    "event_id": str(eid),
                    "title": event_titles.get(eid, ""),
                    "unread_count": unread,
                }
            )

        return items

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _message_to_dict(message: CrewMessage) -> dict:
        """Convert a CrewMessage ORM object to a response dict."""
        user = message.user
        return {
            "id": str(message.id),
            "event_id": str(message.event_id),
            "user_id": str(message.user_id) if message.user_id else None,
            "nickname": user.nickname if user else None,
            "avatar_url": user.avatar_url if user else None,
            "content": message.content,
            "message_type": message.message_type,
            "created_at": message.created_at,
        }
