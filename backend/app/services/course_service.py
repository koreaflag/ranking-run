"""Course service: CRUD operations, spatial queries (PostGIS), and course management."""

from uuid import UUID

from geoalchemy2.shape import from_shape
from shapely.geometry import LineString, Point
from sqlalchemy import and_, desc, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models.course import Course, CourseStats
from app.models.run_record import RunRecord


class CourseService:
    """Handles course CRUD, spatial queries, and stats retrieval."""

    async def create_course(
        self,
        db: AsyncSession,
        user_id: UUID,
        run_record_id: UUID,
        title: str,
        description: str | None,
        route_geometry_geojson: dict,
        distance_meters: int,
        estimated_duration_seconds: int,
        elevation_gain_meters: int = 0,
        elevation_profile: list[float] | None = None,
        is_public: bool = True,
        tags: list[str] | None = None,
    ) -> Course:
        """Create a new course from a run record."""
        result = await db.execute(
            select(RunRecord).where(
                RunRecord.id == run_record_id,
                RunRecord.user_id == user_id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise NotFoundError(
                code="NOT_FOUND",
                message="Run record not found or not owned by you",
            )

        route_wkb = None
        start_wkb = None
        coordinates = route_geometry_geojson.get("coordinates", [])

        if len(coordinates) >= 2:
            line = LineString([(c[0], c[1]) for c in coordinates])
            route_wkb = from_shape(line, srid=4326)

            first_coord = coordinates[0]
            start_point = Point(first_coord[0], first_coord[1])
            start_wkb = from_shape(start_point, srid=4326)

        course = Course(
            creator_id=user_id,
            run_record_id=run_record_id,
            title=title,
            description=description,
            route_geometry=route_wkb,
            start_point=start_wkb,
            distance_meters=distance_meters,
            estimated_duration_seconds=estimated_duration_seconds,
            elevation_gain_meters=elevation_gain_meters,
            elevation_profile=elevation_profile,
            is_public=is_public,
            tags=tags or [],
        )
        db.add(course)
        await db.flush()

        stats = CourseStats(course_id=course.id)
        db.add(stats)
        await db.flush()

        return course

    async def get_course_by_id(self, db: AsyncSession, course_id: UUID) -> Course | None:
        """Get a course by ID."""
        result = await db.execute(
            select(Course).where(Course.id == course_id)
        )
        return result.scalar_one_or_none()

    async def list_courses(
        self,
        db: AsyncSession,
        min_distance: int | None = None,
        max_distance: int | None = None,
        near_lat: float | None = None,
        near_lng: float | None = None,
        near_radius: int = 10000,
        order_by: str = "created_at",
        order: str = "desc",
        page: int = 0,
        per_page: int = 20,
    ) -> tuple[list[dict], int]:
        """List public courses with filtering, spatial queries, and pagination."""
        filters = [Course.is_public == True]

        if min_distance is not None:
            filters.append(Course.distance_meters >= min_distance)
        if max_distance is not None:
            filters.append(Course.distance_meters <= max_distance)

        has_spatial = near_lat is not None and near_lng is not None
        if has_spatial:
            user_point = func.ST_MakePoint(near_lng, near_lat)
            user_geog = func.cast(user_point, text("geography"))
            filters.append(
                func.ST_DWithin(Course.start_point, user_geog, near_radius)
            )

        count_q = select(func.count(Course.id)).where(and_(*filters))
        total_result = await db.execute(count_q)
        total_count = total_result.scalar() or 0

        if has_spatial:
            user_point = func.ST_MakePoint(near_lng, near_lat)
            user_geog = func.cast(user_point, text("geography"))
            distance_col = func.ST_Distance(Course.start_point, user_geog).label("distance_from_user")
            query = select(Course, distance_col).where(and_(*filters))
        else:
            query = select(Course).where(and_(*filters))

        if order_by == "distance_from_user" and has_spatial:
            order_expr = text("distance_from_user")
        elif order_by == "total_runs":
            query = query.outerjoin(CourseStats, CourseStats.course_id == Course.id)
            order_expr = func.coalesce(CourseStats.total_runs, 0)
        else:
            order_expr = getattr(Course, order_by, Course.created_at)

        if order == "asc":
            query = query.order_by(order_expr)
        else:
            query = query.order_by(desc(order_expr))

        query = query.offset(page * per_page).limit(per_page)

        result = await db.execute(query)
        rows = result.all()

        courses_data = []
        for row in rows:
            if has_spatial:
                course = row[0]
                distance_from_user = row[1]
            else:
                course = row[0] if isinstance(row, tuple) else row
                distance_from_user = None

            creator_info = {
                "id": str(course.creator.id) if course.creator else "",
                "nickname": course.creator.nickname if course.creator else None,
                "avatar_url": course.creator.avatar_url if course.creator else None,
            }

            stats_info = {"total_runs": 0, "unique_runners": 0, "avg_pace_seconds_per_km": None}
            if course.stats:
                stats_info = {
                    "total_runs": course.stats.total_runs,
                    "unique_runners": course.stats.unique_runners,
                    "avg_pace_seconds_per_km": course.stats.avg_pace_seconds_per_km,
                }

            courses_data.append({
                "id": str(course.id),
                "title": course.title,
                "thumbnail_url": course.thumbnail_url,
                "distance_meters": course.distance_meters,
                "estimated_duration_seconds": course.estimated_duration_seconds,
                "elevation_gain_meters": course.elevation_gain_meters,
                "creator": creator_info,
                "stats": stats_info,
                "created_at": course.created_at,
                "distance_from_user_meters": distance_from_user,
            })

        return courses_data, total_count

    async def get_nearby_courses(
        self,
        db: AsyncSession,
        lat: float,
        lng: float,
        radius: int = 5000,
        limit: int = 5,
    ) -> list[dict]:
        """Get nearby courses using PostGIS ST_DWithin."""
        user_point = func.ST_MakePoint(lng, lat)
        user_geog = func.cast(user_point, text("geography"))

        distance_col = func.ST_Distance(Course.start_point, user_geog).label("distance_m")

        query = (
            select(Course, distance_col)
            .outerjoin(CourseStats, CourseStats.course_id == Course.id)
            .where(
                Course.is_public == True,
                func.ST_DWithin(Course.start_point, user_geog, radius),
            )
            .order_by(distance_col)
            .limit(limit)
        )

        result = await db.execute(query)
        rows = result.all()

        nearby = []
        for row in rows:
            course = row[0]
            distance_m = row[1]

            nearby.append({
                "id": str(course.id),
                "title": course.title,
                "thumbnail_url": course.thumbnail_url,
                "distance_meters": course.distance_meters,
                "estimated_duration_seconds": course.estimated_duration_seconds,
                "total_runs": course.stats.total_runs if course.stats else 0,
                "avg_pace_seconds_per_km": course.stats.avg_pace_seconds_per_km if course.stats else None,
                "creator_nickname": course.creator.nickname if course.creator else None,
                "distance_from_user_meters": distance_m,
            })

        return nearby

    async def get_courses_in_bounds(
        self,
        db: AsyncSession,
        sw_lat: float,
        sw_lng: float,
        ne_lat: float,
        ne_lng: float,
        limit: int = 50,
    ) -> list[dict]:
        """Get courses within a map viewport bounding box."""
        envelope = func.ST_MakeEnvelope(sw_lng, sw_lat, ne_lng, ne_lat, 4326)
        envelope_geog = func.cast(envelope, text("geography"))

        start_lat = func.ST_Y(func.cast(Course.start_point, text("geometry"))).label("start_lat")
        start_lng = func.ST_X(func.cast(Course.start_point, text("geometry"))).label("start_lng")

        query = (
            select(
                Course.id,
                Course.title,
                start_lat,
                start_lng,
                Course.distance_meters,
                func.coalesce(CourseStats.total_runs, 0).label("total_runs"),
            )
            .outerjoin(CourseStats, CourseStats.course_id == Course.id)
            .where(
                Course.is_public == True,
                func.ST_Intersects(Course.start_point, envelope_geog),
            )
            .limit(limit)
        )

        result = await db.execute(query)
        rows = result.all()

        return [
            {
                "id": str(row.id),
                "title": row.title,
                "start_lat": row.start_lat,
                "start_lng": row.start_lng,
                "distance_meters": row.distance_meters,
                "total_runs": row.total_runs,
            }
            for row in rows
        ]

    async def update_course(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
        update_data: dict,
    ) -> Course:
        """Update a course (owner only)."""
        course = await self._get_owned_course(db, course_id, user_id)

        if "title" in update_data and update_data["title"] is not None:
            course.title = update_data["title"]
        if "description" in update_data and update_data["description"] is not None:
            course.description = update_data["description"]
        if "is_public" in update_data and update_data["is_public"] is not None:
            course.is_public = update_data["is_public"]
        if "tags" in update_data and update_data["tags"] is not None:
            course.tags = update_data["tags"]

        await db.flush()
        return course

    async def delete_course(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
    ) -> None:
        """Delete a course (owner only)."""
        course = await self._get_owned_course(db, course_id, user_id)

        await db.execute(
            update(RunRecord)
            .where(RunRecord.course_id == course_id)
            .values(course_id=None)
        )

        await db.delete(course)
        await db.flush()

    async def get_course_stats(
        self,
        db: AsyncSession,
        course_id: UUID,
    ) -> CourseStats | None:
        """Get course statistics."""
        result = await db.execute(
            select(CourseStats).where(CourseStats.course_id == course_id)
        )
        return result.scalar_one_or_none()

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    async def _get_owned_course(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
    ) -> Course:
        """Fetch a course and verify ownership."""
        result = await db.execute(
            select(Course).where(Course.id == course_id)
        )
        course = result.scalar_one_or_none()

        if course is None:
            raise NotFoundError(code="NOT_FOUND", message="Course not found")

        if course.creator_id != user_id:
            raise PermissionDeniedError(
                code="PERMISSION_DENIED",
                message="You are not the owner of this course",
            )

        return course
