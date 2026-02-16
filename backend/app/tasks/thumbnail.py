"""Background task: course thumbnail generation.

In production, this would render the route on a map and upload to S3.
For MVP, this is a placeholder that logs the action.
"""

import logging
from uuid import UUID

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.course import Course

logger = logging.getLogger(__name__)


async def generate_course_thumbnail(course_id: UUID) -> None:
    """Generate a thumbnail image for a course based on its route geometry.

    This is a placeholder implementation. In production, this would:
    1. Fetch the route_geometry from the database.
    2. Render the route on a static map image (e.g., using Mapbox Static Images API
       or a headless browser with Leaflet/Mapbox GL).
    3. Upload the image to S3/GCS.
    4. Update the course thumbnail_url in the database.

    Args:
        course_id: The course to generate a thumbnail for.
    """
    logger.info("Generating thumbnail for course %s (placeholder)", course_id)

    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(Course).where(Course.id == course_id)
            )
            course = result.scalar_one_or_none()

            if course is None:
                logger.warning("Course %s not found for thumbnail generation", course_id)
                return

            # Placeholder: set a default thumbnail URL
            # In production, replace with actual image generation + S3 upload
            course.thumbnail_url = f"/static/thumbnails/course_{course_id}.png"
            await db.commit()

            logger.info("Thumbnail placeholder set for course %s", course_id)

    except Exception:
        logger.exception("Failed to generate thumbnail for course %s", course_id)
