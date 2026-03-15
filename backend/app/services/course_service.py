"""Course service: CRUD operations, spatial queries (PostGIS), and course management."""

import logging
import math
from urllib.parse import quote
from uuid import UUID

import sqlalchemy as sa
from geoalchemy2 import Geography
from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import LineString, Point
from sqlalchemy import and_, desc, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models.course import Course, CourseStats
from app.models.like import CourseLike
from app.models.review import Review
from app.models.run_record import RunRecord
from app.models.run_session import RunSession
from app.models.user import User
from app.services.map_matching_service import MapMatchingService

logger = logging.getLogger(__name__)


def get_route_preview(course: "Course", max_points: int = 50) -> list[list[float]] | None:
    """Return a simplified route preview as [[lng, lat], ...] for thumbnail map rendering.

    Uses Douglas-Peucker simplification to reduce GPS noise while keeping shape.
    """
    if course.route_geometry is None:
        return None

    shapely_geom = to_shape(course.route_geometry)
    coords = list(shapely_geom.coords)
    if len(coords) < 2:
        return None

    # Remove consecutive near-duplicate points (GPS stutter)
    deduped = [coords[0]]
    for c in coords[1:]:
        prev = deduped[-1]
        if abs(c[0] - prev[0]) < 0.00001 and abs(c[1] - prev[1]) < 0.00001:
            continue
        deduped.append(c)
    if len(deduped) < 2:
        return None

    # Douglas-Peucker simplification (~10m tolerance)
    line = LineString([(c[0], c[1]) for c in deduped])
    smoothed = line.simplify(0.0001, preserve_topology=True)
    simplified = list(smoothed.coords)

    # Further limit if still too many
    if len(simplified) > max_points:
        step = max(1, len(simplified) // max_points)
        reduced = simplified[::step]
        if reduced[-1] != simplified[-1]:
            reduced.append(simplified[-1])
        simplified = reduced

    return [[round(c[0], 6), round(c[1], 6)] for c in simplified]


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

    1. Removes consecutive duplicate coordinates (GPS stutter)
    2. Applies Douglas-Peucker simplification (~10m tolerance) to smooth noise
    3. Limits to 80 points max for URL length constraints
    """
    if not access_token or not route_geometry:
        return None

    coords = route_geometry.get("coordinates", [])
    if len(coords) < 2:
        return None

    # Step 1: Remove consecutive duplicate/near-duplicate points
    deduped = [coords[0]]
    for c in coords[1:]:
        prev = deduped[-1]
        # Skip if essentially the same point (< ~1m)
        if abs(c[0] - prev[0]) < 0.00001 and abs(c[1] - prev[1]) < 0.00001:
            continue
        deduped.append(c)
    if len(deduped) < 2:
        return None

    # Step 2: Shapely Douglas-Peucker to smooth GPS noise
    line = LineString([(c[0], c[1]) for c in deduped])
    # ~10m tolerance for clean thumbnail appearance
    smoothed = line.simplify(0.0001, preserve_topology=True)
    simplified_coords = list(smoothed.coords)

    # Step 3: Limit to 80 points for URL length
    if len(simplified_coords) > 80:
        step = max(1, len(simplified_coords) // 80)
        reduced = simplified_coords[::step]
        if reduced[-1] != simplified_coords[-1]:
            reduced.append(simplified_coords[-1])
        simplified_coords = reduced

    if len(simplified_coords) < 2:
        return None

    # Build polyline string: lng,lat;lng,lat;...
    polyline_str = ";".join(f"{c[0]:.6f},{c[1]:.6f}" for c in simplified_coords)

    # URL-encode the path — match world map route color (#FFC800)
    path = f"path-4+FFC800-0.9({quote(polyline_str)})"

    return (
        f"https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/"
        f"{path}/auto/600x300@2x?access_token={access_token}&padding=50"
    )


def _haversine(coord1: list, coord2: list) -> float:
    """Calculate distance in meters between two [lng, lat] coordinates using haversine formula."""
    R = 6371000
    lat1, lat2 = math.radians(coord1[1]), math.radians(coord2[1])
    dlat = lat2 - lat1
    dlng = math.radians(coord2[0] - coord1[0])
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _interpolate_along_line(coords: list, target_distance: float) -> list[float]:
    """Return [lng, lat] coordinate at target_distance meters along the route."""
    accumulated = 0.0
    for i in range(len(coords) - 1):
        seg_dist = _haversine(coords[i], coords[i + 1])
        if accumulated + seg_dist >= target_distance:
            fraction = (target_distance - accumulated) / seg_dist if seg_dist > 0 else 0
            lng = coords[i][0] + fraction * (coords[i + 1][0] - coords[i][0])
            lat = coords[i][1] + fraction * (coords[i + 1][1] - coords[i][1])
            return [lng, lat]
        accumulated += seg_dist
    return coords[-1][:2]


def _generate_checkpoints(route_coords: list, interval_meters: int = 500) -> list[dict]:
    """Generate checkpoints along a route at fixed interval.

    route_coords: [[lng, lat], [lng, lat], ...] or [[lng, lat, alt], ...]
    Returns empty list for routes shorter than 1km.
    Last intermediate checkpoint must be at least 200m from the finish.

    Always includes start (order=0) and finish (last order) checkpoints.
    """
    if len(route_coords) < 2:
        return []

    # Calculate total route distance
    total_distance = 0.0
    for i in range(len(route_coords) - 1):
        total_distance += _haversine(route_coords[i], route_coords[i + 1])

    if total_distance < 1000:
        return []

    checkpoints = []

    # Start checkpoint (order=0)
    first = route_coords[0]
    checkpoints.append({
        "id": 1,
        "order": 0,
        "lat": first[1],
        "lng": first[0],
        "distance_from_start_meters": 0,
    })

    # Intermediate checkpoints (order=1..N)
    cp_id = 2
    order = 1
    target = interval_meters

    while target < total_distance:
        # Skip if too close to finish (< 200m)
        if total_distance - target < 200:
            break

        point = _interpolate_along_line(route_coords, target)
        checkpoints.append({
            "id": cp_id,
            "order": order,
            "lat": point[1],
            "lng": point[0],
            "distance_from_start_meters": int(target),
        })
        cp_id += 1
        order += 1
        target += interval_meters

    # Finish checkpoint (last order)
    last = route_coords[-1]
    checkpoints.append({
        "id": cp_id,
        "order": order,
        "lat": last[1],
        "lng": last[0],
        "distance_from_start_meters": int(total_distance),
    })

    return checkpoints


class CourseService:
    """Handles course CRUD, spatial queries, and stats retrieval."""

    MAX_COURSES_PER_DAY = 10

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
        from datetime import datetime, timedelta, timezone
        from app.core.exceptions import BadRequestError

        # Rate limit: max courses per user per 24 hours
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        recent_count_result = await db.execute(
            select(func.count(Course.id)).where(
                Course.creator_id == user_id,
                Course.created_at >= since,
            )
        )
        recent_count = recent_count_result.scalar() or 0
        if recent_count >= self.MAX_COURSES_PER_DAY:
            raise BadRequestError(
                code="COURSE_RATE_LIMIT",
                message=f"코스는 24시간 내 최대 {self.MAX_COURSES_PER_DAY}개까지 생성할 수 있습니다",
            )

        result = await db.execute(
            select(RunRecord).where(
                RunRecord.id == run_record_id,
                RunRecord.user_id == user_id,
            )
        )
        source_run = result.scalar_one_or_none()
        if source_run is None:
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
                match_result = await matcher.match_route(coordinates)
                await matcher.close()
                matched_coordinates = match_result.coordinates
                logger.info(
                    f"[CourseService] Map matching: {len(coordinates)} pts → {len(matched_coordinates)} pts"
                )
            except Exception as e:
                logger.warning(f"[CourseService] Map matching failed, using raw route: {e}")

            matched_line = LineString([(c[0], c[1]) for c in matched_coordinates])
            route_wkb = from_shape(matched_line, srid=4326)

            first_coord = matched_coordinates[0]
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

        # Generate checkpoints (500m interval, skip if < 1km)
        if len(coordinates) >= 2:
            checkpoints = _generate_checkpoints(matched_coordinates, 500)
            course.checkpoints = checkpoints if checkpoints else None
            course.checkpoint_interval_meters = 500
            await db.flush()

        # Link the original run record to the new course so the creator's
        # time appears on the leaderboard.  The run that "defined" the course
        # is, by definition, a complete traversal of the route.
        source_run.course_id = course.id
        source_run.course_completed = True
        await db.flush()

        # Seed the course stats with the creator's run
        stats.total_runs = 1
        stats.unique_runners = 1
        stats.best_duration_seconds = source_run.duration_seconds
        stats.best_pace_seconds_per_km = source_run.avg_pace_seconds_per_km
        stats.avg_duration_seconds = source_run.duration_seconds
        stats.avg_pace_seconds_per_km = source_run.avg_pace_seconds_per_km
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

        # Lazy backfill: generate checkpoints for existing courses that don't have them
        checkpoints = course.checkpoints
        if checkpoints is None and route_geojson and route_geojson.get("coordinates"):
            checkpoints = _generate_checkpoints(route_geojson["coordinates"])
            if checkpoints:
                course.checkpoints = checkpoints
                course.checkpoint_interval_meters = 500
                await db.flush()

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
            "checkpoints": checkpoints,
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
        user_id: "UUID | None" = None,
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

        # Scalar subqueries for enriched data
        like_count_sub = (
            select(func.count(CourseLike.id))
            .where(CourseLike.course_id == Course.id)
            .correlate(Course)
            .scalar_subquery()
            .label("like_count")
        )

        active_runners_sub = (
            select(func.count(RunSession.id))
            .where(
                RunSession.course_id == Course.id,
                RunSession.status == "active",
            )
            .correlate(Course)
            .scalar_subquery()
            .label("active_runners")
        )

        extra_columns = [like_count_sub, active_runners_sub]

        if user_id is not None:
            my_best_sub = (
                select(func.min(RunRecord.duration_seconds))
                .where(
                    RunRecord.user_id == user_id,
                    RunRecord.course_id == Course.id,
                )
                .correlate(Course)
                .scalar_subquery()
                .label("my_best_duration_seconds")
            )
            extra_columns.append(my_best_sub)

        if has_spatial:
            user_point = func.ST_MakePoint(near_lng, near_lat)
            user_geog = func.cast(user_point, text("geography"))
            distance_col = func.ST_Distance(Course.start_point, user_geog).label("distance_from_user")
            query = select(Course, distance_col, *extra_columns).where(and_(*filters))
        else:
            query = select(Course, *extra_columns).where(and_(*filters))

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
            # Row layout: Course, [distance_from_user], like_count, active_runners, [my_best]
            idx = 0
            course = row[idx]; idx += 1

            if has_spatial:
                distance_from_user = row[idx]; idx += 1
            else:
                distance_from_user = None

            like_count = row[idx] or 0; idx += 1
            active_runners = row[idx] or 0; idx += 1

            my_best = None
            if user_id is not None:
                my_best = row[idx]; idx += 1

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
                "route_preview": get_route_preview(course),
                "distance_meters": course.distance_meters,
                "estimated_duration_seconds": course.estimated_duration_seconds,
                "elevation_gain_meters": course.elevation_gain_meters,
                "creator": creator_info,
                "stats": stats_info,
                "created_at": course.created_at,
                "distance_from_user_meters": distance_from_user,
                "like_count": like_count,
                "active_runners": active_runners,
                "my_best_duration_seconds": my_best,
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
        user_point = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)
        user_geog = user_point.cast(Geography())

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
                "thumbnail_url": get_thumbnail_url_for_course(course),
                "route_preview": get_route_preview(course),
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

        # Skip spatial filter when requesting the entire world
        is_global = sw_lat <= -89 and sw_lng <= -179 and ne_lat >= 89 and ne_lng >= 179

        spatial_clause = "" if is_global else """
              AND ST_Intersects(
                  c.start_point,
                  ST_MakeEnvelope(:sw_lng, :sw_lat, :ne_lng, :ne_lat, 4326)::geography
              )"""

        query = text(f"""
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
              {spatial_clause}
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
        if "course_type" in update_data and update_data["course_type"] is not None:
            course.course_type = update_data["course_type"]
        if "lap_count" in update_data and update_data["lap_count"] is not None:
            course.lap_count = update_data["lap_count"]

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
