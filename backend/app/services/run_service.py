"""Run service: session management, chunk handling, completion, and recovery."""

from datetime import datetime
from uuid import UUID

from geoalchemy2.shape import from_shape
from shapely.geometry import LineString
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.course import Course
from app.models.run_chunk import RunChunk
from app.models.run_record import RunRecord
from app.models.run_session import RunSession


class RunService:
    """Handles run sessions, GPS chunk uploads, completion, and crash recovery."""

    async def create_session(
        self,
        db: AsyncSession,
        user_id: UUID,
        started_at: datetime,
        course_id: UUID | None = None,
        device_info: dict | None = None,
    ) -> RunSession:
        """Create a new run session."""
        if course_id is not None:
            course_result = await db.execute(
                select(Course).where(Course.id == course_id)
            )
            if course_result.scalar_one_or_none() is None:
                raise NotFoundError(code="NOT_FOUND", message="Course not found")

        session = RunSession(
            user_id=user_id,
            course_id=course_id,
            status="active",
            started_at=started_at,
            device_info=device_info,
        )
        db.add(session)
        await db.flush()
        return session

    async def upload_chunk(
        self,
        db: AsyncSession,
        user_id: UUID,
        session_id: UUID,
        sequence: int,
        chunk_type: str,
        raw_gps_points: list[dict],
        filtered_points: list[dict] | None,
        chunk_summary: dict,
        cumulative: dict,
        completed_splits: list[dict],
        pause_intervals: list[dict],
    ) -> RunChunk:
        """Upload a GPS data chunk for a run session."""
        await self._get_active_session(db, session_id, user_id)

        existing = await db.execute(
            select(RunChunk).where(
                RunChunk.session_id == session_id,
                RunChunk.sequence == sequence,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise ConflictError(
                code="DUPLICATE_CHUNK",
                message=f"Chunk with sequence {sequence} already exists",
            )

        chunk = RunChunk(
            session_id=session_id,
            sequence=sequence,
            chunk_type=chunk_type,
            raw_gps_points=raw_gps_points,
            filtered_points=filtered_points,
            chunk_summary=chunk_summary,
            cumulative=cumulative,
            completed_splits=completed_splits,
            pause_intervals=pause_intervals,
        )
        db.add(chunk)
        await db.flush()
        return chunk

    async def batch_upload_chunks(
        self,
        db: AsyncSession,
        user_id: UUID,
        session_id: UUID,
        chunks_data: list[dict],
    ) -> tuple[list[int], list[int]]:
        """Batch upload multiple chunks (for recovery of missed chunks)."""
        await self._get_active_session(db, session_id, user_id, allow_completed=True)

        received = []
        failed = []

        for chunk_data in chunks_data:
            try:
                seq = chunk_data.get("sequence", -1)
                existing = await db.execute(
                    select(RunChunk.id).where(
                        RunChunk.session_id == session_id,
                        RunChunk.sequence == seq,
                    )
                )
                if existing.scalar_one_or_none() is not None:
                    received.append(seq)
                    continue

                chunk = RunChunk(
                    session_id=session_id,
                    sequence=seq,
                    chunk_type=chunk_data.get("chunk_type", "intermediate"),
                    raw_gps_points=chunk_data.get("raw_gps_points", []),
                    filtered_points=chunk_data.get("filtered_points"),
                    chunk_summary=chunk_data.get("chunk_summary", {}),
                    cumulative=chunk_data.get("cumulative", {}),
                    completed_splits=chunk_data.get("completed_splits", []),
                    pause_intervals=chunk_data.get("pause_intervals", []),
                )
                db.add(chunk)
                await db.flush()
                received.append(seq)
            except Exception:
                failed.append(chunk_data.get("sequence", -1))

        return received, failed

    async def complete_session(
        self,
        db: AsyncSession,
        user_id: UUID,
        session_id: UUID,
        complete_data: dict,
    ) -> tuple[RunRecord, list[int]]:
        """Complete a run session and create the final run record."""
        session = await self._get_active_session(db, session_id, user_id)

        route_wkb = None
        route_geo_data = complete_data.get("route_geometry")
        if route_geo_data and route_geo_data.get("coordinates"):
            coords = route_geo_data["coordinates"]
            if len(coords) >= 2:
                line = LineString([(c[0], c[1]) for c in coords])
                route_wkb = from_shape(line, srid=4326)

        run_record = RunRecord(
            user_id=user_id,
            session_id=session_id,
            course_id=session.course_id,
            distance_meters=complete_data["distance_meters"],
            duration_seconds=complete_data["duration_seconds"],
            total_elapsed_seconds=complete_data.get("total_elapsed_seconds"),
            avg_pace_seconds_per_km=complete_data.get("avg_pace_seconds_per_km"),
            best_pace_seconds_per_km=complete_data.get("best_pace_seconds_per_km"),
            avg_speed_ms=complete_data.get("avg_speed_ms"),
            max_speed_ms=complete_data.get("max_speed_ms"),
            calories=complete_data.get("calories"),
            elevation_gain_meters=complete_data.get("elevation_gain_meters", 0),
            elevation_loss_meters=complete_data.get("elevation_loss_meters", 0),
            route_geometry=route_wkb,
            elevation_profile=complete_data.get("elevation_profile"),
            splits=complete_data.get("splits"),
            pause_intervals=complete_data.get("pause_intervals"),
            filter_config=complete_data.get("filter_config"),
            started_at=session.started_at,
            finished_at=complete_data["finished_at"],
        )

        course_completion = complete_data.get("course_completion")
        if course_completion and session.course_id:
            run_record.course_completed = course_completion.get("is_completed", False)
            run_record.route_match_percent = course_completion.get("route_match_percent")
            run_record.max_deviation_meters = course_completion.get("max_deviation_meters")

        db.add(run_record)

        session.status = "completed"
        await db.flush()

        total_chunks = complete_data.get("total_chunks", 0)

        existing_chunks_result = await db.execute(
            select(RunChunk.sequence).where(RunChunk.session_id == session_id)
        )
        server_sequences = {row.sequence for row in existing_chunks_result.all()}

        expected_sequences = set(range(total_chunks))
        missing = sorted(expected_sequences - server_sequences)

        return run_record, missing

    async def recover_session(
        self,
        db: AsyncSession,
        user_id: UUID,
        session_id: UUID,
        finished_at: datetime,
        total_chunks: int,
        uploaded_chunk_sequences: list[int],
    ) -> tuple[RunRecord, list[int]]:
        """Recover a crashed session by reconstructing the run from server-held chunks."""
        result = await db.execute(
            select(RunSession).where(
                RunSession.id == session_id,
                RunSession.user_id == user_id,
            )
        )
        session = result.scalar_one_or_none()
        if session is None:
            raise NotFoundError(code="NOT_FOUND", message="Session not found")

        if session.status == "completed":
            raise ConflictError(code="ALREADY_COMPLETED", message="Session already completed")

        chunks_result = await db.execute(
            select(RunChunk)
            .where(RunChunk.session_id == session_id)
            .order_by(RunChunk.sequence)
        )
        chunks = chunks_result.scalars().all()

        if not chunks:
            raise AppError(
                code="NO_CHUNKS",
                message="No chunks found for this session, cannot recover",
            )

        last_chunk = chunks[-1]
        cumulative = last_chunk.cumulative or {}

        total_distance = int(cumulative.get("total_distance_meters", 0))
        total_duration = int(cumulative.get("total_duration_seconds", 0))
        avg_pace = int(cumulative.get("avg_pace_seconds_per_km", 0)) if cumulative.get("avg_pace_seconds_per_km") else None

        all_points = []
        all_splits = []
        all_pauses = []

        for chunk in chunks:
            points = chunk.filtered_points or chunk.raw_gps_points
            if isinstance(points, list):
                for p in points:
                    if isinstance(p, dict) and "lng" in p and "lat" in p:
                        all_points.append((p["lng"], p["lat"]))

            splits = chunk.completed_splits
            if isinstance(splits, list):
                all_splits.extend(splits)

            pauses = chunk.pause_intervals
            if isinstance(pauses, list):
                all_pauses.extend(pauses)

        route_wkb = None
        if len(all_points) >= 2:
            line = LineString(all_points)
            route_wkb = from_shape(line, srid=4326)

        run_record = RunRecord(
            user_id=user_id,
            session_id=session_id,
            course_id=session.course_id,
            distance_meters=total_distance,
            duration_seconds=total_duration,
            avg_pace_seconds_per_km=avg_pace,
            route_geometry=route_wkb,
            splits=all_splits if all_splits else None,
            pause_intervals=all_pauses if all_pauses else None,
            started_at=session.started_at,
            finished_at=finished_at,
        )
        db.add(run_record)

        session.status = "recovered"
        await db.flush()

        server_sequences = {c.sequence for c in chunks}
        expected = set(range(total_chunks))
        missing = sorted(expected - server_sequences)

        return run_record, missing

    async def get_run_record(
        self,
        db: AsyncSession,
        run_id: UUID,
        user_id: UUID,
    ) -> RunRecord | None:
        """Get a run record by ID, ensuring it belongs to the user."""
        result = await db.execute(
            select(RunRecord).where(
                RunRecord.id == run_id,
                RunRecord.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    async def _get_active_session(
        self,
        db: AsyncSession,
        session_id: UUID,
        user_id: UUID,
        allow_completed: bool = False,
    ) -> RunSession:
        """Fetch a session and verify ownership and status."""
        result = await db.execute(
            select(RunSession).where(
                RunSession.id == session_id,
                RunSession.user_id == user_id,
            )
        )
        session = result.scalar_one_or_none()
        if session is None:
            raise NotFoundError(code="NOT_FOUND", message="Session not found")

        valid_statuses = {"active"}
        if allow_completed:
            valid_statuses.add("completed")
            valid_statuses.add("recovered")

        if session.status not in valid_statuses:
            raise ConflictError(
                code="INVALID_SESSION_STATE",
                message=f"Session is in '{session.status}' state, expected one of {valid_statuses}",
            )

        return session
