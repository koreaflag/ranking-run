"""Event service: manage events, participation, and map markers."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.event import Event, EventParticipant


class EventService:
    """Handles event CRUD, participation, and map marker queries."""

    async def get_active_events(
        self,
        db: AsyncSession,
        page: int = 0,
        per_page: int = 20,
        current_user_id: UUID | None = None,
    ) -> tuple[list[dict], int]:
        """Get paginated list of active events.

        Returns:
            Tuple of (event dicts with participant_count and is_participating, total count).
        """
        now = datetime.now(timezone.utc)

        # Count active events
        count_result = await db.execute(
            select(func.count(Event.id)).where(
                Event.is_active.is_(True),
                Event.ends_at > now,
            )
        )
        total_count = count_result.scalar_one()

        # Fetch events
        result = await db.execute(
            select(Event)
            .where(Event.is_active.is_(True), Event.ends_at > now)
            .order_by(Event.starts_at.asc())
            .offset(page * per_page)
            .limit(per_page)
        )
        events = result.scalars().all()

        # Batch-load participant counts and participation status
        event_ids = [e.id for e in events]
        enriched = await self._enrich_events(db, events, event_ids, current_user_id)

        return enriched, total_count

    async def get_event_by_id(
        self,
        db: AsyncSession,
        event_id: UUID,
        current_user_id: UUID | None = None,
    ) -> dict:
        """Get a single event by ID with participant info.

        Raises:
            NotFoundError: Event does not exist.
        """
        result = await db.execute(
            select(Event).where(Event.id == event_id)
        )
        event = result.scalar_one_or_none()

        if event is None:
            raise NotFoundError(
                code="NOT_FOUND", message="이벤트를 찾을 수 없습니다"
            )

        enriched = await self._enrich_events(
            db, [event], [event.id], current_user_id
        )
        return enriched[0]

    async def join_event(
        self,
        db: AsyncSession,
        event_id: UUID,
        user_id: UUID,
    ) -> EventParticipant:
        """Join an event.

        Raises:
            NotFoundError: Event does not exist.
            ValidationError: Event is not active or has ended.
            ConflictError: Already participating or max participants reached.
        """
        result = await db.execute(
            select(Event).where(Event.id == event_id)
        )
        event = result.scalar_one_or_none()

        if event is None:
            raise NotFoundError(
                code="NOT_FOUND", message="이벤트를 찾을 수 없습니다"
            )

        now = datetime.now(timezone.utc)
        if not event.is_active or event.ends_at <= now:
            raise ValidationError(
                code="EVENT_ENDED", message="종료되었거나 비활성화된 이벤트입니다"
            )

        # Check for duplicate participation
        existing = await db.execute(
            select(EventParticipant.id).where(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise ConflictError(
                code="ALREADY_JOINED", message="이미 참여중인 이벤트입니다"
            )

        # Check max participants
        if event.max_participants is not None:
            count_result = await db.execute(
                select(func.count(EventParticipant.id)).where(
                    EventParticipant.event_id == event_id
                )
            )
            current_count = count_result.scalar_one()
            if current_count >= event.max_participants:
                raise ConflictError(
                    code="EVENT_FULL", message="참여 인원이 가득 찼습니다"
                )

        participant = EventParticipant(event_id=event_id, user_id=user_id)
        db.add(participant)
        await db.flush()
        await db.refresh(participant)

        return participant

    async def leave_event(
        self,
        db: AsyncSession,
        event_id: UUID,
        user_id: UUID,
    ) -> None:
        """Leave an event.

        Raises:
            NotFoundError: Participation record does not exist.
        """
        result = await db.execute(
            select(EventParticipant).where(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
            )
        )
        participant = result.scalar_one_or_none()

        if participant is None:
            raise NotFoundError(
                code="NOT_FOUND", message="참여 기록을 찾을 수 없습니다"
            )

        await db.delete(participant)
        await db.flush()

    async def get_event_map_markers(
        self,
        db: AsyncSession,
        sw_lat: float,
        sw_lng: float,
        ne_lat: float,
        ne_lng: float,
    ) -> list[dict]:
        """Get active event markers within a map viewport bounding box.

        Only returns events that have center_lat/center_lng set and
        are currently active (not ended).
        """
        now = datetime.now(timezone.utc)

        result = await db.execute(
            select(Event)
            .where(
                Event.is_active.is_(True),
                Event.ends_at > now,
                Event.center_lat.isnot(None),
                Event.center_lng.isnot(None),
                Event.center_lat >= sw_lat,
                Event.center_lat <= ne_lat,
                Event.center_lng >= sw_lng,
                Event.center_lng <= ne_lng,
            )
            .order_by(Event.ends_at.asc())
        )
        events = result.scalars().all()

        # Batch-load participant counts
        event_ids = [e.id for e in events]
        counts = await self._get_participant_counts(db, event_ids)

        return [
            {
                "id": str(e.id),
                "title": e.title,
                "event_type": e.event_type,
                "badge_color": e.badge_color,
                "badge_icon": e.badge_icon,
                "center_lat": e.center_lat,
                "center_lng": e.center_lng,
                "participant_count": counts.get(e.id, 0),
                "ends_at": e.ends_at,
            }
            for e in events
        ]

    async def update_participant_progress(
        self,
        db: AsyncSession,
        event_id: UUID,
        user_id: UUID,
        distance: int,
        runs: int,
    ) -> None:
        """Update a participant's progress in an event.

        Raises:
            NotFoundError: Participation record does not exist.
        """
        result = await db.execute(
            select(EventParticipant).where(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
            )
        )
        participant = result.scalar_one_or_none()

        if participant is None:
            raise NotFoundError(
                code="NOT_FOUND", message="참여 기록을 찾을 수 없습니다"
            )

        participant.progress_distance_meters = distance
        participant.progress_runs = runs

        # Check event to see if target goals are met
        event_result = await db.execute(
            select(Event).where(Event.id == event_id)
        )
        event = event_result.scalar_one_or_none()
        if event is not None:
            distance_met = (
                event.target_distance_meters is None
                or distance >= event.target_distance_meters
            )
            runs_met = (
                event.target_runs is None or runs >= event.target_runs
            )
            participant.completed = distance_met and runs_met

        await db.flush()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_participant_counts(
        self,
        db: AsyncSession,
        event_ids: list[UUID],
    ) -> dict[UUID, int]:
        """Get participant counts for a list of event IDs."""
        if not event_ids:
            return {}

        result = await db.execute(
            select(
                EventParticipant.event_id,
                func.count(EventParticipant.id),
            )
            .where(EventParticipant.event_id.in_(event_ids))
            .group_by(EventParticipant.event_id)
        )
        return {row[0]: row[1] for row in result.all()}

    async def _get_user_participations(
        self,
        db: AsyncSession,
        event_ids: list[UUID],
        user_id: UUID | None,
    ) -> set[UUID]:
        """Get the set of event IDs that a user is participating in."""
        if not event_ids or user_id is None:
            return set()

        result = await db.execute(
            select(EventParticipant.event_id).where(
                EventParticipant.event_id.in_(event_ids),
                EventParticipant.user_id == user_id,
            )
        )
        return {row[0] for row in result.all()}

    async def _enrich_events(
        self,
        db: AsyncSession,
        events: list,
        event_ids: list[UUID],
        current_user_id: UUID | None,
    ) -> list[dict]:
        """Enrich Event ORM objects with participant_count and is_participating."""
        counts = await self._get_participant_counts(db, event_ids)
        participating = await self._get_user_participations(
            db, event_ids, current_user_id
        )

        return [
            {
                "id": str(e.id),
                "title": e.title,
                "description": e.description,
                "event_type": e.event_type,
                "course_id": str(e.course_id) if e.course_id else None,
                "starts_at": e.starts_at,
                "ends_at": e.ends_at,
                "target_distance_meters": e.target_distance_meters,
                "target_runs": e.target_runs,
                "badge_color": e.badge_color,
                "badge_icon": e.badge_icon,
                "participant_count": counts.get(e.id, 0),
                "is_participating": e.id in participating,
                "is_active": e.is_active,
                "center_lat": e.center_lat,
                "center_lng": e.center_lng,
            }
            for e in events
        ]
