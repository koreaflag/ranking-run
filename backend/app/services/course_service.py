"""Course service: CRUD operations, spatial queries (PostGIS), and course management."""

import logging
from urllib.parse import quote
from uuid import UUID

import sqlalchemy as sa
from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import LineString, Point
from sqlalchemy import and_, desc, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models.course import Course, CourseStats
from app.models.review import Review
from app.models.run_record import RunRecord
from app.models.run_session import RunSession
from app.models.user import User
from app.services.map_matching_service import MapMatchingService

logger = logging.getLogger(__name__)


def get_thumbnail_url_for_course(course: "Course") -> str | None:
    """Return existing thumbnail_url or generate one dynamically from route geometry."""
    if course.thumbnail_url:
        return course.thumbnail_url

    if course.route_geometry is None:
        return None

    settings = get_settings()
    if not settings.MAPBOX_ACCESS_TOKEN:
        return None

    shapely_geom = to_shape(course.route_geometry)
    coords = list(shapely_geom.coords)
    geojson = {
        "type": shapely_geom.geom_type,
        "coordinates": [[c[0], c[1], c[2] if len(c) > 2 else 0.0] for c in coords],
    }
    return generate_thumbnail_url(geojson, settings.MAPBOX_ACCESS_TOKEN)


def generate_thumbnail_url(route_geometry: dict, access_token: str) -> str | None:
    """Generate a Mapbox Static Images URL from route geometry.

    Simplifies the route to at most 50 coordinate pairs to stay within
    URL length limits, then builds a Mapbox Static Images API URL with
    the route drawn as a colored path overlay.
    """
    if not access_token or not route_geometry:
        return None

    coords = route_geometry.get("coordinates", [])
    if len(coords) < 2:
        return None

    # Simplify to max 50 points for URL length limit
    step = max(1, len(coords) // 50)
    simplified = coords[::step]
    if simplified[-1] != coords[-1]:
        simplified.append(coords[-1])

    # Build polyline string: lng,lat;lng,lat;...
    polyline_str = ";".join(f"{c[0]:.5f},{c[1]:.5f}" for c in simplified)

    # URL-encode the path
    path = f"path-4+FF6B35-0.8({quote(polyline_str)})"

    return (
        f"https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/"
        f"{path}/auto/400x200@2x?access_token={access_token}&padding=30"
    )


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
        course_type: str | None = None,
        lap_count: int | None = None,
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
        raw_route_wkb = None
        start_wkb = None
        coordinates = route_geometry_geojson.get("coordinates", [])

        if len(coordinates) >= 2:
            # Store raw GPS route
            raw_line = LineString([(c[0], c[1]) for c in coordinates])
            raw_route_wkb = from_shape(raw_line, srid=4326)

            # Apply map matching to snap route to road/path network
            matched_coordinates = coordinates
            try:
                matcher = MapMatchingService()
                matched_coordinates = await matcher.match_route(coordinates)
                await matcher.close()
                logger.info(
                    f"[CourseService] Map matching: {len(coordinates)} pts → {len(matched_coordinates)} pts"
                )
            except Exception as e:
                logger.warning(f"[CourseService] Map matching failed, using raw route: {e}")

            matched_line = LineString([(c[0], c[1]) for c in matched_coordinates])
            route_wkb = from_shape(matched_line, srid=4326)

            first_coord = coordinates[0]
            start_point = Point(first_coord[0], first_coord[1])
            start_wkb = from_shape(start_point, srid=4326)

        difficulty = self._compute_difficulty(
            distance_meters=distance_meters,
            elevation_gain_meters=elevation_gain_meters,
        )

        course = Course(
            creator_id=user_id,
            run_record_id=run_record_id,
            title=title,
            description=description,
            route_geometry=route_wkb,
            raw_route_geometry=raw_route_wkb,
            start_point=start_wkb,
            distance_meters=distance_meters,
            estimated_duration_seconds=estimated_duration_seconds,
            elevation_gain_meters=elevation_gain_meters,
            elevation_profile=elevation_profile,
            is_public=is_public,
            tags=tags or [],
            difficulty=difficulty,
            course_type=course_type,
            lap_count=lap_count,
        )
        db.add(course)
        await db.flush()

        stats = CourseStats(course_id=course.id)
        db.add(stats)
        await db.flush()

        # Generate thumbnail URL from matched route (or raw if matching failed)
        settings = get_settings()
        thumbnail_geojson = {
            "type": "LineString",
            "coordinates": matched_coordinates if len(coordinates) >= 2 else [],
        } if len(coordinates) >= 2 else route_geometry_geojson
        thumbnail_url = generate_thumbnail_url(
            route_geometry=thumbnail_geojson,
            access_token=settings.MAPBOX_ACCESS_TOKEN,
        )
        if thumbnail_url:
            course.thumbnail_url = thumbnail_url
            await db.flush()

        return course

    async def get_course_by_id(self, db: AsyncSession, course_id: UUID) -> Course | None:
        """Get a course by ID."""
        result = await db.execute(
            select(Course).where(Course.id == course_id)
        )
        return result.scalar_one_or_none()

    async def get_course_detail(self, db: AsyncSession, course_id: UUID) -> dict | None:
        """Get full course detail with route_geometry converted to GeoJSON.

        Returns a dict ready for Pydantic serialization, or None if not found.
        The WKBElement stored in PostGIS is converted to a GeoJSON-compatible
        dict with type "LineString" and coordinates as [lng, lat, alt] arrays.
        """
        course = await self.get_course_by_id(db, course_id)
        if course is None:
            return None

        creator_info = {
            "id": str(course.creator.id) if course.creator else "",
            "nickname": course.creator.nickname if course.creator else None,
            "avatar_url": course.creator.avatar_url if course.creator else None,
        }

        route_geojson = self._wkb_to_geojson(course.route_geometry)

        return {
            "id": str(course.id),
            "title": course.title,
            "description": course.description,
            "route_geometry": route_geojson,
            "distance_meters": course.distance_meters,
            "estimated_duration_seconds": course.estimated_duration_seconds,
            "elevation_gain_meters": course.elevation_gain_meters,
            "elevation_profile": course.elevation_profile,
            "thumbnail_url": get_thumbnail_url_for_course(course),
            "is_public": course.is_public,
            "created_at": course.created_at,
            "creator": creator_info,
        }

    @staticmethod
    def _wkb_to_geojson(wkb_element: WKBElement | None) -> dict | None:
        """Convert a PostGIS WKBElement to a GeoJSON-compatible dict.

        Returns a dict like:
            {"type": "LineString", "coordinates": [[lng, lat, alt], ...]}
        or None if the input is None.
        """
        if wkb_element is None:
            return None

        shapely_geom = to_shape(wkb_element)
        coords = list(shapely_geom.coords)

        # shapely coords may be 2D (lng, lat) or 3D (lng, lat, alt).
        # Normalise to [lng, lat, alt] with alt=0 when absent.
        coordinates = [
            [c[0], c[1], c[2] if len(c) > 2 else 0.0]
            for c in coords
        ]

        return {
            "type": shapely_geom.geom_type,  # "LineString"
            "coordinates": coordinates,
        }

    async def list_courses(
        self,
        db: AsyncSession,
        search: str | None = None,
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

        if search:
            filters.append(Course.title.ilike(f"%{search}%"))

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

        # When searching, sort by relevance first (exact > starts with > contains)
        if search:
            search_lower = search.lower()
            relevance = sa.case(
                (func.lower(Course.title) == search_lower, 0),
                (func.lower(Course.title).like(f"{search_lower}%"), 1),
                else_=2,
            )
            query = query.order_by(relevance, desc(Course.created_at))
        elif order_by == "distance_from_user" and has_spatial:
            order_expr = text("distance_from_user")
            if order == "asc":
                query = query.order_by(order_expr)
            else:
                query = query.order_by(desc(order_expr))
        elif order_by == "total_runs":
            query = query.outerjoin(CourseStats, CourseStats.course_id == Course.id)
            order_expr = func.coalesce(CourseStats.total_runs, 0)
            if order == "asc":
                query = query.order_by(order_expr)
            else:
                query = query.order_by(desc(order_expr))
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
                course = row[0]
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
                "thumbnail_url": get_thumbnail_url_for_course(course),
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
        """Get courses within a map viewport bounding box.

        Returns enriched marker data including difficulty, avg_rating,
        active_runners count, is_new flag, elevation, and creator nickname.
        """
        from datetime import datetime, timedelta, timezone

        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

        query = text("""
            SELECT
                c.id,
                c.title,
                ST_Y(c.start_point::geometry) AS start_lat,
                ST_X(c.start_point::geometry) AS start_lng,
                c.distance_meters,
                COALESCE(cs.total_runs, 0) AS total_runs,
                c.difficulty,
                ar.avg_rating,
                COALESCE(act.active_runners, 0) AS active_runners,
                c.created_at,
                c.elevation_gain_meters,
                u.nickname AS creator_nickname
            FROM courses c
            LEFT JOIN course_stats cs ON cs.course_id = c.id
            LEFT JOIN (
                SELECT course_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating
                FROM reviews
                GROUP BY course_id
            ) ar ON ar.course_id = c.id
            LEFT JOIN (
                SELECT course_id, COUNT(*) AS active_runners
                FROM run_sessions
                WHERE status = 'active'
                GROUP BY course_id
            ) act ON act.course_id = c.id
            LEFT JOIN users u ON u.id = c.creator_id
            WHERE c.is_public = true
              AND ST_Intersects(
                  c.start_point,
                  ST_MakeEnvelope(:sw_lng, :sw_lat, :ne_lng, :ne_lat, 4326)::geography
              )
            LIMIT :limit
        """)

        result = await db.execute(
            query,
            {
                "sw_lat": sw_lat,
                "sw_lng": sw_lng,
                "ne_lat": ne_lat,
                "ne_lng": ne_lng,
                "limit": limit,
            },
        )
        rows = result.all()

        return [
            {
                "id": str(row.id),
                "title": row.title,
                "start_lat": float(row.start_lat) if row.start_lat else 0,
                "start_lng": float(row.start_lng) if row.start_lng else 0,
                "distance_meters": row.distance_meters,
                "total_runs": row.total_runs,
                "difficulty": row.difficulty,
                "avg_rating": float(row.avg_rating) if row.avg_rating is not None else None,
                "active_runners": row.active_runners,
                "is_new": row.created_at >= seven_days_ago if row.created_at else False,
                "elevation_gain_meters": row.elevation_gain_meters or 0,
                "creator_nickname": row.creator_nickname,
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

    @staticmethod
    def _compute_difficulty(
        distance_meters: int,
        elevation_gain_meters: int,
        completion_rate: float | None = None,
    ) -> str:
        """Compute course difficulty as 'easy', 'medium', or 'hard'.

        Score formula (0-100):
          - distance_score  (30%): 0m=0 → 10km+=100
          - elevation_score (30%): 0m=0 → 300m+=100
          - gradient_score  (20%): elevation_gain / distance ratio
          - completion_score(20%): inverse of completion_rate (lower = harder)

        Lv.1 (easy):   score < 33
        Lv.2 (medium): 33 <= score < 66
        Lv.3 (hard):   score >= 66
        """
        # Distance: 0-10km mapped to 0-100
        dist_score = min(distance_meters / 10000 * 100, 100)

        # Elevation: 0-300m mapped to 0-100
        elev_score = min(elevation_gain_meters / 300 * 100, 100)

        # Gradient: elevation per km (0-60m/km mapped to 0-100)
        if distance_meters > 0:
            gradient_per_km = (elevation_gain_meters / distance_meters) * 1000
            grad_score = min(gradient_per_km / 60 * 100, 100)
        else:
            grad_score = 0

        # Completion rate: 100%=0 (easy), 0%=100 (hard)
        if completion_rate is not None:
            comp_score = (1.0 - completion_rate) * 100
        else:
            # No data yet — neutral score, let other factors decide
            comp_score = 50

        total = (
            dist_score * 0.3
            + elev_score * 0.3
            + grad_score * 0.2
            + comp_score * 0.2
        )

        if total < 33:
            return "easy"
        elif total < 66:
            return "medium"
        else:
            return "hard"

    async def recalculate_difficulty(
        self,
        db: AsyncSession,
        course_id: UUID,
    ) -> str | None:
        """Recalculate difficulty for a course using completion rate data."""
        result = await db.execute(
            select(Course, CourseStats)
            .outerjoin(CourseStats, CourseStats.course_id == Course.id)
            .where(Course.id == course_id)
        )
        row = result.one_or_none()
        if row is None:
            return None

        course, stats = row
        completion_rate = stats.completion_rate if stats else None

        new_difficulty = self._compute_difficulty(
            distance_meters=course.distance_meters,
            elevation_gain_meters=course.elevation_gain_meters or 0,
            completion_rate=completion_rate,
        )

        if course.difficulty != new_difficulty:
            course.difficulty = new_difficulty
            await db.flush()

        return new_difficulty

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
