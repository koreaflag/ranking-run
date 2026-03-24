"""Live group run service: real-time multi-user running with WebSocket support."""

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import WebSocket
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.models.course import Course
from app.models.live_group_run import LiveGroupRun, LiveGroupRunParticipant
from app.models.user import User

logger = logging.getLogger(__name__)


class ConnectionManager:
    """In-memory WebSocket connection manager for live group runs."""

    def __init__(self) -> None:
        # {group_run_id: {user_id: WebSocket}}
        self._connections: dict[UUID, dict[UUID, WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self, group_run_id: UUID, user_id: UUID, ws: WebSocket
    ) -> None:
        async with self._lock:
            if group_run_id not in self._connections:
                self._connections[group_run_id] = {}
            self._connections[group_run_id][user_id] = ws

    async def disconnect(self, group_run_id: UUID, user_id: UUID) -> None:
        async with self._lock:
            if group_run_id in self._connections:
                self._connections[group_run_id].pop(user_id, None)
                if not self._connections[group_run_id]:
                    del self._connections[group_run_id]

    async def broadcast(
        self, group_run_id: UUID, message: dict, exclude_user_id: UUID | None = None
    ) -> None:
        connections = self._connections.get(group_run_id, {})
        disconnected: list[UUID] = []

        for uid, ws in connections.items():
            if exclude_user_id and uid == exclude_user_id:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(uid)

        # Cleanup broken connections
        for uid in disconnected:
            await self.disconnect(group_run_id, uid)

    async def send_to_user(
        self, group_run_id: UUID, user_id: UUID, message: dict
    ) -> None:
        connections = self._connections.get(group_run_id, {})
        ws = connections.get(user_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                await self.disconnect(group_run_id, user_id)

    async def broadcast_all(self, group_run_id: UUID, message: dict) -> None:
        """Broadcast to ALL connected users including sender."""
        await self.broadcast(group_run_id, message, exclude_user_id=None)

    def get_connected_count(self, group_run_id: UUID) -> int:
        return len(self._connections.get(group_run_id, {}))


# Singleton connection manager
connection_manager = ConnectionManager()


class LiveGroupRunService:
    """Handles live group run lifecycle and real-time coordination."""

    async def create_live_group_run(
        self,
        db: AsyncSession,
        course_id: UUID,
        title: str,
        host_user_id: UUID,
        max_participants: int = 10,
        scheduled_at: datetime | None = None,
    ) -> dict:
        # Validate course exists
        course = await db.get(Course, course_id)
        if course is None:
            raise NotFoundError(
                code="COURSE_NOT_FOUND", message="코스를 찾을 수 없습니다"
            )

        live_group_run = LiveGroupRun(
            course_id=course_id,
            host_user_id=host_user_id,
            title=title,
            status="waiting",
            max_participants=max_participants,
            scheduled_at=scheduled_at,
        )
        db.add(live_group_run)
        await db.flush()

        # Host automatically joins
        participant = LiveGroupRunParticipant(
            live_group_run_id=live_group_run.id,
            user_id=host_user_id,
            status="joined",
        )
        db.add(participant)
        await db.flush()
        await db.refresh(live_group_run)

        return await self._to_response_dict(db, live_group_run)

    async def get_active_live_group_runs(
        self,
        db: AsyncSession,
        course_id: UUID | None = None,
        page: int = 0,
        per_page: int = 20,
    ) -> dict:
        query = (
            select(LiveGroupRun)
            .where(LiveGroupRun.status.in_(["waiting", "running"]))
            .options(joinedload(LiveGroupRun.host))
            .order_by(LiveGroupRun.created_at.desc())
        )
        if course_id:
            query = query.where(LiveGroupRun.course_id == course_id)

        # Count
        count_query = select(func.count()).select_from(
            select(LiveGroupRun.id)
            .where(LiveGroupRun.status.in_(["waiting", "running"]))
        )
        if course_id:
            count_query = select(func.count()).select_from(
                select(LiveGroupRun.id).where(
                    LiveGroupRun.status.in_(["waiting", "running"]),
                    LiveGroupRun.course_id == course_id,
                )
            )
        total_result = await db.execute(count_query)
        total_count = total_result.scalar() or 0

        result = await db.execute(query.offset(page * per_page).limit(per_page))
        group_runs = result.scalars().unique().all()

        data = [await self._to_response_dict(db, gr) for gr in group_runs]
        return {"data": data, "total_count": total_count}

    async def get_live_group_run(
        self,
        db: AsyncSession,
        live_group_run_id: UUID,
    ) -> dict:
        group_run = await self._get_or_404(db, live_group_run_id)
        return await self._to_response_dict(db, group_run)

    async def join_live_group_run(
        self,
        db: AsyncSession,
        live_group_run_id: UUID,
        user_id: UUID,
    ) -> dict:
        group_run = await self._get_or_404(db, live_group_run_id)

        if group_run.status not in ("waiting", "running"):
            raise BadRequestError(
                code="GROUP_RUN_NOT_JOINABLE",
                message="참가할 수 없는 상태입니다",
            )

        # Check if already a participant
        existing = await self._get_participant(db, live_group_run_id, user_id)
        if existing is not None:
            raise ConflictError(
                code="ALREADY_JOINED", message="이미 참가한 그룹런입니다"
            )

        # Check participant limit
        count_result = await db.execute(
            select(func.count()).where(
                LiveGroupRunParticipant.live_group_run_id == live_group_run_id,
                LiveGroupRunParticipant.status.in_(["joined", "running", "completed"]),
            )
        )
        current_count = count_result.scalar() or 0
        if current_count >= group_run.max_participants:
            raise BadRequestError(
                code="GROUP_RUN_FULL",
                message=f"최대 참가 인원({group_run.max_participants}명)을 초과했습니다",
            )

        participant = LiveGroupRunParticipant(
            live_group_run_id=live_group_run_id,
            user_id=user_id,
            status="joined",
        )
        db.add(participant)
        await db.flush()

        return await self._to_response_dict(db, group_run)

    async def start_live_group_run(
        self,
        db: AsyncSession,
        live_group_run_id: UUID,
        user_id: UUID,
    ) -> dict:
        group_run = await self._get_or_404(db, live_group_run_id)

        if group_run.host_user_id != user_id:
            raise PermissionDeniedError(
                code="NOT_HOST", message="호스트만 시작할 수 있습니다"
            )

        if group_run.status != "waiting":
            raise BadRequestError(
                code="ALREADY_STARTED", message="이미 시작된 그룹런입니다"
            )

        now = datetime.now(timezone.utc)
        group_run.status = "running"
        group_run.started_at = now

        # Update all joined participants to running
        participants_result = await db.execute(
            select(LiveGroupRunParticipant).where(
                LiveGroupRunParticipant.live_group_run_id == live_group_run_id,
                LiveGroupRunParticipant.status == "joined",
            )
        )
        for p in participants_result.scalars().all():
            p.status = "running"

        await db.flush()

        # Broadcast start to all connected WebSocket clients
        await connection_manager.broadcast_all(
            live_group_run_id, {"type": "started"}
        )

        return await self._to_response_dict(db, group_run)

    async def update_participant_location(
        self,
        db: AsyncSession,
        live_group_run_id: UUID,
        user_id: UUID,
        lat: float,
        lng: float,
        distance_m: float,
        duration_s: int,
        pace: str | None = None,
    ) -> None:
        participant = await self._get_participant(db, live_group_run_id, user_id)
        if participant is None:
            return

        now = datetime.now(timezone.utc)
        participant.last_lat = lat
        participant.last_lng = lng
        participant.current_distance_m = distance_m
        participant.current_duration_s = duration_s
        participant.last_updated_at = now
        await db.flush()

    async def mark_participant_completed(
        self,
        db: AsyncSession,
        live_group_run_id: UUID,
        user_id: UUID,
    ) -> None:
        participant = await self._get_participant(db, live_group_run_id, user_id)
        if participant is None:
            return
        participant.status = "completed"
        await db.flush()

        # Broadcast completion
        await connection_manager.broadcast_all(
            live_group_run_id,
            {"type": "completed", "user_id": str(user_id)},
        )

        # Check if all participants completed
        result = await db.execute(
            select(func.count()).where(
                LiveGroupRunParticipant.live_group_run_id == live_group_run_id,
                LiveGroupRunParticipant.status == "running",
            )
        )
        still_running = result.scalar() or 0
        if still_running == 0:
            group_run = await self._get_or_404(db, live_group_run_id)
            group_run.status = "completed"
            group_run.completed_at = datetime.now(timezone.utc)
            await db.flush()

    async def mark_participant_dropped(
        self,
        db: AsyncSession,
        live_group_run_id: UUID,
        user_id: UUID,
    ) -> None:
        participant = await self._get_participant(db, live_group_run_id, user_id)
        if participant is None:
            return
        participant.status = "dropped"
        await db.flush()

    async def get_participants_snapshot(
        self,
        db: AsyncSession,
        live_group_run_id: UUID,
    ) -> list[dict]:
        """Get current state of all participants for broadcasting."""
        result = await db.execute(
            select(LiveGroupRunParticipant)
            .where(
                LiveGroupRunParticipant.live_group_run_id == live_group_run_id,
                LiveGroupRunParticipant.status.in_(
                    ["joined", "running", "completed"]
                ),
            )
            .options(joinedload(LiveGroupRunParticipant.user))
        )
        participants = result.scalars().unique().all()

        data = []
        for p in participants:
            pace = None
            if p.current_duration_s > 0 and p.current_distance_m > 0:
                pace_seconds_per_km = p.current_duration_s / (
                    p.current_distance_m / 1000
                )
                minutes = int(pace_seconds_per_km) // 60
                seconds = int(pace_seconds_per_km) % 60
                pace = f"{minutes}'{seconds:02d}\""

            data.append(
                {
                    "user_id": str(p.user_id),
                    "nickname": p.user.nickname if p.user else None,
                    "avatar_url": p.user.avatar_url if p.user else None,
                    "lat": p.last_lat,
                    "lng": p.last_lng,
                    "distance_m": p.current_distance_m,
                    "pace": pace,
                    "status": p.status,
                }
            )
        return data

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_or_404(
        self, db: AsyncSession, live_group_run_id: UUID
    ) -> LiveGroupRun:
        result = await db.execute(
            select(LiveGroupRun)
            .where(LiveGroupRun.id == live_group_run_id)
            .options(joinedload(LiveGroupRun.host))
        )
        group_run = result.scalar_one_or_none()
        if group_run is None:
            raise NotFoundError(
                code="LIVE_GROUP_RUN_NOT_FOUND",
                message="라이브 그룹런을 찾을 수 없습니다",
            )
        return group_run

    async def _get_participant(
        self,
        db: AsyncSession,
        live_group_run_id: UUID,
        user_id: UUID,
    ) -> LiveGroupRunParticipant | None:
        result = await db.execute(
            select(LiveGroupRunParticipant).where(
                LiveGroupRunParticipant.live_group_run_id == live_group_run_id,
                LiveGroupRunParticipant.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def _to_response_dict(
        self,
        db: AsyncSession,
        group_run: LiveGroupRun,
    ) -> dict:
        # Get participants
        participants_result = await db.execute(
            select(LiveGroupRunParticipant)
            .where(
                LiveGroupRunParticipant.live_group_run_id == group_run.id,
            )
            .options(joinedload(LiveGroupRunParticipant.user))
            .order_by(LiveGroupRunParticipant.joined_at)
        )
        participants = participants_result.scalars().unique().all()

        # Get course name
        course = await db.get(Course, group_run.course_id)
        course_name = course.title if course else None

        participant_list = []
        for p in participants:
            pace = None
            if p.current_duration_s > 0 and p.current_distance_m > 0:
                pace_seconds_per_km = p.current_duration_s / (
                    p.current_distance_m / 1000
                )
                minutes = int(pace_seconds_per_km) // 60
                seconds = int(pace_seconds_per_km) % 60
                pace = f"{minutes}'{seconds:02d}\""

            participant_list.append(
                {
                    "user_id": str(p.user_id),
                    "nickname": p.user.nickname if p.user else None,
                    "avatar_url": p.user.avatar_url if p.user else None,
                    "status": p.status,
                    "current_distance_m": p.current_distance_m,
                    "current_duration_s": p.current_duration_s,
                    "last_lat": p.last_lat,
                    "last_lng": p.last_lng,
                    "pace": pace,
                    "joined_at": p.joined_at,
                }
            )

        active_count = sum(
            1
            for p in participants
            if p.status in ("joined", "running", "completed")
        )

        return {
            "id": str(group_run.id),
            "course_id": str(group_run.course_id),
            "course_name": course_name,
            "host_user_id": str(group_run.host_user_id),
            "host_nickname": (
                group_run.host.nickname if group_run.host else None
            ),
            "title": group_run.title,
            "status": group_run.status,
            "max_participants": group_run.max_participants,
            "participant_count": active_count,
            "participants": participant_list,
            "scheduled_at": group_run.scheduled_at,
            "started_at": group_run.started_at,
            "completed_at": group_run.completed_at,
            "created_at": group_run.created_at,
        }
