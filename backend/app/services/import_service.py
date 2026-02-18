"""Import service: orchestrates file upload, parsing, and run record creation."""

import logging
import uuid
from datetime import datetime
from pathlib import Path
from uuid import UUID

import aiofiles
from geoalchemy2.shape import from_shape
from shapely.geometry import LineString
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.course import Course
from app.models.external_import import ExternalImport
from app.models.run_record import RunRecord
from app.models.run_session import RunSession
from app.services.course_matcher import Point2D, calculate_route_match
from app.services.file_parser import FileParserService, ParsedActivity

logger = logging.getLogger(__name__)


class ImportService:
    """Orchestrates file upload, parsing, RunRecord creation, and course matching."""

    def __init__(self) -> None:
        self._parser = FileParserService()

    async def process_import(
        self,
        db: AsyncSession,
        import_id: UUID,
        user_id: UUID,
    ) -> None:
        """Full import pipeline: parse file -> create RunRecord -> match courses.

        This method is called from a background task. The caller is responsible
        for providing a session (typically via ``async_session_factory``).
        """
        # Fetch the import record
        result = await db.execute(
            select(ExternalImport).where(ExternalImport.id == import_id)
        )
        ext_import = result.scalar_one_or_none()
        if ext_import is None:
            logger.warning("Import %s not found", import_id)
            return

        try:
            # Update status to processing
            ext_import.status = "processing"
            await db.flush()

            # Read file and parse based on source type
            if ext_import.source in ("gpx_upload", "fit_upload"):
                file_path = ext_import.file_path
                if not file_path:
                    raise ValueError("No file path")
                async with aiofiles.open(file_path, "rb") as f:
                    file_content = await f.read()

                if ext_import.source == "gpx_upload":
                    activity = self._parser.parse_gpx(file_content)
                else:
                    activity = self._parser.parse_fit(file_content)
            elif ext_import.source == "strava":
                activity = self._deserialize_strava_activity(ext_import.raw_metadata)
            else:
                raise ValueError(f"Unsupported source: {ext_import.source}")

            # Validate parsed data
            if activity.distance_meters < 100:
                raise ValueError("Activity too short (< 100m)")
            if activity.duration_seconds < 30:
                raise ValueError("Activity too short (< 30s)")
            if not activity.route_coordinates:
                raise ValueError("No GPS data in file")

            # Create a RunSession (status='imported' for FK consistency)
            session = RunSession(
                user_id=user_id,
                course_id=None,
                status="imported",
                started_at=activity.started_at or ext_import.created_at,
                device_info={
                    "source": ext_import.source,
                    "device": activity.source_device,
                },
            )
            db.add(session)
            await db.flush()

            # Build route geometry (PostGIS LineString)
            coords_2d = [
                (c[0], c[1]) for c in activity.route_coordinates
            ]  # (lng, lat)
            route_geom = (
                from_shape(LineString(coords_2d), srid=4326)
                if len(coords_2d) >= 2
                else None
            )

            # Create RunRecord
            run_record = RunRecord(
                user_id=user_id,
                session_id=session.id,
                course_id=None,
                distance_meters=activity.distance_meters,
                duration_seconds=activity.duration_seconds,
                total_elapsed_seconds=activity.total_elapsed_seconds,
                avg_pace_seconds_per_km=activity.avg_pace_seconds_per_km,
                best_pace_seconds_per_km=activity.best_pace_seconds_per_km,
                avg_speed_ms=activity.avg_speed_ms,
                max_speed_ms=activity.max_speed_ms,
                calories=None,
                elevation_gain_meters=activity.elevation_gain_meters,
                elevation_loss_meters=activity.elevation_loss_meters,
                route_geometry=route_geom,
                elevation_profile=(
                    activity.elevation_profile
                    if activity.elevation_profile
                    else None
                ),
                splits=(
                    [
                        {
                            "split_number": s.split_number,
                            "distance_meters": s.distance_meters,
                            "duration_seconds": s.duration_seconds,
                            "pace_seconds_per_km": s.pace_seconds_per_km,
                            "elevation_change_meters": s.elevation_change_meters,
                        }
                        for s in activity.splits
                    ]
                    if activity.splits
                    else None
                ),
                pause_intervals=[],
                filter_config=None,
                course_completed=None,
                route_match_percent=None,
                max_deviation_meters=None,
                source=ext_import.source,
                external_import_id=ext_import.id,
                started_at=activity.started_at or ext_import.created_at,
                finished_at=activity.finished_at or ext_import.created_at,
            )
            db.add(run_record)
            await db.flush()

            # Update import summary
            ext_import.import_summary = {
                "distance_meters": activity.distance_meters,
                "duration_seconds": activity.duration_seconds,
                "avg_pace_seconds_per_km": activity.avg_pace_seconds_per_km,
                "elevation_gain_meters": activity.elevation_gain_meters,
                "elevation_loss_meters": activity.elevation_loss_meters,
                "point_count": len(activity.points),
                "source_device": activity.source_device,
            }
            ext_import.run_record_id = run_record.id

            # Try course matching
            course_match = await self._match_to_courses(db, run_record, activity)
            if course_match:
                ext_import.course_match = course_match

            ext_import.status = "completed"

            # Update user stats
            from app.models.user import User

            user_result = await db.execute(
                select(User).where(User.id == user_id)
            )
            user = user_result.scalar_one_or_none()
            if user:
                user.total_distance_meters = (
                    user.total_distance_meters or 0
                ) + activity.distance_meters
                user.total_runs = (user.total_runs or 0) + 1

            await db.commit()

            logger.info(
                "Import %s completed: %dm, %ds",
                import_id,
                activity.distance_meters,
                activity.duration_seconds,
            )

            # Trigger ranking recalculation outside the main transaction
            # (recalculate_course_ranking opens its own session)
            if course_match and course_match.get("is_completed"):
                from app.tasks.ranking import recalculate_course_ranking

                await recalculate_course_ranking(
                    course_id=UUID(course_match["course_id"]),
                    user_id=run_record.user_id,
                    run_record_id=run_record.id,
                )

        except Exception as e:
            ext_import.status = "failed"
            ext_import.error_message = str(e)
            await db.commit()
            logger.exception("Import %s failed: %s", import_id, e)

    async def _match_to_courses(
        self,
        db: AsyncSession,
        run_record: RunRecord,
        activity: ParsedActivity,
    ) -> dict | None:
        """Match imported route against existing courses using PostGIS proximity + route matcher."""
        if not activity.route_coordinates or len(activity.route_coordinates) < 2:
            return None

        # Get start point
        start_lng = activity.route_coordinates[0][0]
        start_lat = activity.route_coordinates[0][1]

        # Find candidate courses within 500m of start point using PostGIS
        from geoalchemy2 import functions as geo_func

        start_point_wkt = f"SRID=4326;POINT({start_lng} {start_lat})"

        candidates = await db.execute(
            select(Course)
            .where(
                geo_func.ST_DWithin(
                    Course.start_point,
                    sa_func.ST_GeogFromText(start_point_wkt),
                    500,  # 500 meters
                )
            )
            .where(Course.is_public == True)  # noqa: E712
            .limit(10)
        )
        courses = candidates.scalars().all()

        if not courses:
            return None

        # Convert runner points to Point2D
        runner_points = [
            Point2D(lat=pt.lat, lng=pt.lng) for pt in activity.points
        ]

        best_match = None
        best_match_percent = 0.0

        for course in courses:
            # Extract course geometry coordinates
            if not course.route_geometry:
                continue

            # Use Shapely to load course geometry
            from geoalchemy2.shape import to_shape

            course_shape = to_shape(course.route_geometry)
            course_points = [
                Point2D(lat=c[1], lng=c[0]) for c in course_shape.coords
            ]

            if len(course_points) < 2:
                continue

            match_result = calculate_route_match(runner_points, course_points)

            if match_result.route_match_percent > best_match_percent:
                best_match_percent = match_result.route_match_percent
                best_match = {
                    "course": course,
                    "result": match_result,
                }

        if best_match and best_match["result"].is_completed:
            course = best_match["course"]
            result = best_match["result"]

            # Update run record with course match
            run_record.course_id = course.id
            run_record.course_completed = True
            run_record.route_match_percent = result.route_match_percent
            run_record.max_deviation_meters = result.max_deviation_meters
            await db.flush()

            return {
                "course_id": str(course.id),
                "course_title": course.title,
                "match_percent": result.route_match_percent,
                "is_completed": True,
            }

        return None

    async def save_upload_file(
        self,
        file_content: bytes,
        filename: str,
        source: str,
    ) -> str:
        """Save uploaded file to disk and return the file path."""
        settings = get_settings()
        upload_dir = Path(settings.UPLOAD_DIR) / "imports"
        upload_dir.mkdir(parents=True, exist_ok=True)

        ext = Path(filename).suffix.lower()
        file_id = uuid.uuid4().hex
        saved_filename = f"{file_id}{ext}"
        file_path = upload_dir / saved_filename

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_content)

        return str(file_path)

    @staticmethod
    def _deserialize_strava_activity(raw_metadata: dict | None) -> ParsedActivity:
        """Reconstruct ParsedActivity from raw_metadata stored by Strava sync."""
        from app.services.file_parser import TrackPoint, ParsedSplit

        if not raw_metadata:
            raise ValueError("Strava import has no raw_metadata")

        def _parse_dt(s: str | None) -> datetime | None:
            if not s:
                return None
            return datetime.fromisoformat(s)

        points = [
            TrackPoint(
                lat=pt["lat"],
                lng=pt["lng"],
                alt=pt.get("alt", 0.0),
                timestamp=_parse_dt(pt.get("timestamp")),
                heart_rate=pt.get("heart_rate"),
            )
            for pt in raw_metadata.get("points", [])
        ]
        splits = [
            ParsedSplit(
                split_number=s["split_number"],
                distance_meters=s["distance_meters"],
                duration_seconds=s["duration_seconds"],
                pace_seconds_per_km=s["pace_seconds_per_km"],
                elevation_change_meters=s.get("elevation_change_meters", 0.0),
            )
            for s in raw_metadata.get("splits", [])
        ]
        return ParsedActivity(
            points=points,
            distance_meters=raw_metadata.get("distance_meters", 0),
            duration_seconds=raw_metadata.get("duration_seconds", 0),
            total_elapsed_seconds=raw_metadata.get("total_elapsed_seconds", 0),
            avg_pace_seconds_per_km=raw_metadata.get("avg_pace_seconds_per_km"),
            best_pace_seconds_per_km=raw_metadata.get("best_pace_seconds_per_km"),
            avg_speed_ms=raw_metadata.get("avg_speed_ms"),
            max_speed_ms=raw_metadata.get("max_speed_ms"),
            elevation_gain_meters=raw_metadata.get("elevation_gain_meters", 0),
            elevation_loss_meters=raw_metadata.get("elevation_loss_meters", 0),
            splits=splits,
            elevation_profile=raw_metadata.get("elevation_profile", []),
            route_coordinates=raw_metadata.get("route_coordinates", []),
            started_at=_parse_dt(raw_metadata.get("started_at")),
            finished_at=_parse_dt(raw_metadata.get("finished_at")),
            source_device=raw_metadata.get("source_device"),
        )
