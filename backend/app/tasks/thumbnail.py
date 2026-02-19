"""Background task: course thumbnail generation via Mapbox Static Images API."""

import logging
from uuid import UUID

import httpx
from geoalchemy2.shape import to_shape
from sqlalchemy import select

from app.core.config import get_settings
from app.core.storage import get_storage
from app.db.session import async_session_factory
from app.models.course import Course

logger = logging.getLogger(__name__)

settings = get_settings()

# Mapbox Static Images API
MAPBOX_STATIC_URL = "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static"
THUMBNAIL_WIDTH = 600
THUMBNAIL_HEIGHT = 400


def _build_geojson_overlay(coords: list[tuple[float, float]]) -> str:
    """Build a Mapbox GeoJSON overlay string for the route polyline.

    Simplify coordinates if too many (URL length limit ~8000 chars).
    """
    # Simplify: keep at most 100 points evenly sampled
    if len(coords) > 100:
        step = len(coords) / 100
        simplified = [coords[int(i * step)] for i in range(100)]
        simplified.append(coords[-1])  # Always include last point
        coords = simplified

    coord_str = ",".join(f"[{lng},{lat}]" for lng, lat in coords)

    return (
        f"geojson({{\"type\":\"Feature\",\"geometry\":{{\"type\":\"LineString\","
        f"\"coordinates\":[{coord_str}]}},\"properties\":{{\"stroke\":\"#FF7A33\","
        f"\"stroke-width\":4,\"stroke-opacity\":0.9}}}})"
    )


async def generate_course_thumbnail(course_id: UUID) -> None:
    """Generate a thumbnail image for a course using Mapbox Static Images API.

    1. Fetch route_geometry from DB
    2. Build Mapbox Static Images URL with GeoJSON overlay
    3. Download the image
    4. Upload to storage (local or S3)
    5. Update course.thumbnail_url in DB
    """
    if not settings.MAPBOX_ACCESS_TOKEN:
        logger.warning("MAPBOX_ACCESS_TOKEN not set, skipping thumbnail for course %s", course_id)
        return

    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(Course).where(Course.id == course_id)
            )
            course = result.scalar_one_or_none()

            if course is None:
                logger.warning("Course %s not found for thumbnail generation", course_id)
                return

            if course.route_geometry is None:
                logger.warning("Course %s has no route geometry", course_id)
                return

            # Extract coordinates from PostGIS geometry
            shape = to_shape(course.route_geometry)
            coords = list(shape.coords)  # [(lng, lat), ...]

            if len(coords) < 2:
                logger.warning("Course %s has insufficient coordinates (%d)", course_id, len(coords))
                return

            # Build Mapbox Static Images URL
            overlay = _build_geojson_overlay(coords)
            url = (
                f"{MAPBOX_STATIC_URL}/{overlay}/auto/"
                f"{THUMBNAIL_WIDTH}x{THUMBNAIL_HEIGHT}@2x"
                f"?access_token={settings.MAPBOX_ACCESS_TOKEN}"
                f"&padding=40"
            )

            # Download the image
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=30.0)

            if response.status_code != 200:
                logger.error(
                    "Mapbox Static API returned %d for course %s: %s",
                    response.status_code, course_id, response.text[:200],
                )
                return

            # Upload to storage
            storage = get_storage()
            thumbnail_url = await storage.upload(
                data=response.content,
                folder="thumbnails",
                extension=".png",
            )

            # Update course record
            course.thumbnail_url = thumbnail_url
            await db.commit()

            logger.info("Thumbnail generated for course %s: %s", course_id, thumbnail_url)

    except Exception:
        logger.exception("Failed to generate thumbnail for course %s", course_id)
