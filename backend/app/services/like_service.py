"""Like service: toggle and query course likes."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.course import Course
from app.models.like import CourseLike


class LikeService:
    """Handles course like toggle and status queries."""

    async def toggle_like(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
    ) -> dict:
        """Toggle like status for a course.

        If the user already liked the course, remove the like.
        Otherwise, add a like.

        Returns:
            dict with keys: is_liked (bool), like_count (int)

        Raises:
            NotFoundError: Course does not exist.
        """
        # Verify course exists
        course_result = await db.execute(
            select(Course.id).where(Course.id == course_id)
        )
        if course_result.scalar_one_or_none() is None:
            raise NotFoundError(code="NOT_FOUND", message="코스를 찾을 수 없습니다")

        # Check if already liked
        existing_result = await db.execute(
            select(CourseLike).where(
                CourseLike.course_id == course_id,
                CourseLike.user_id == user_id,
            )
        )
        existing_like = existing_result.scalar_one_or_none()

        if existing_like is not None:
            # Unlike: remove the existing like
            await db.delete(existing_like)
            await db.flush()
            is_liked = False
        else:
            # Like: create a new like
            like = CourseLike(course_id=course_id, user_id=user_id)
            db.add(like)
            await db.flush()
            is_liked = True

        like_count = await self._get_like_count(db, course_id)
        return {"is_liked": is_liked, "like_count": like_count}

    async def get_like_status(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
    ) -> dict:
        """Get the like status for a course and user.

        Returns:
            dict with keys: is_liked (bool), like_count (int)

        Raises:
            NotFoundError: Course does not exist.
        """
        # Verify course exists
        course_result = await db.execute(
            select(Course.id).where(Course.id == course_id)
        )
        if course_result.scalar_one_or_none() is None:
            raise NotFoundError(code="NOT_FOUND", message="코스를 찾을 수 없습니다")

        # Check if user liked
        existing_result = await db.execute(
            select(CourseLike.id).where(
                CourseLike.course_id == course_id,
                CourseLike.user_id == user_id,
            )
        )
        is_liked = existing_result.scalar_one_or_none() is not None

        like_count = await self._get_like_count(db, course_id)
        return {"is_liked": is_liked, "like_count": like_count}

    async def get_course_like_count(
        self,
        db: AsyncSession,
        course_id: UUID,
    ) -> int:
        """Return total likes for a course."""
        return await self._get_like_count(db, course_id)

    async def _get_like_count(
        self,
        db: AsyncSession,
        course_id: UUID,
    ) -> int:
        """Internal helper to count likes for a course."""
        result = await db.execute(
            select(func.count(CourseLike.id)).where(
                CourseLike.course_id == course_id
            )
        )
        return result.scalar_one() or 0
