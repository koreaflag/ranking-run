"""Review service: CRUD operations for course reviews and ratings."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import ConflictError, NotFoundError, PermissionDeniedError
from app.models.course import Course
from app.models.review import Review


class ReviewService:
    """Handles course review CRUD and aggregate rating queries."""

    async def create_review(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
        rating: int | None = None,
        content: str | None = None,
    ) -> Review:
        """Create a new review for a course.

        At least one of rating or content must be provided (enforced by schema).

        Raises:
            NotFoundError: Course does not exist.
            ConflictError: User already reviewed this course.
        """
        # Verify course exists
        course_result = await db.execute(
            select(Course.id).where(Course.id == course_id)
        )
        if course_result.scalar_one_or_none() is None:
            raise NotFoundError(code="NOT_FOUND", message="코스를 찾을 수 없습니다")

        # Check for duplicate review
        duplicate_result = await db.execute(
            select(Review.id).where(
                Review.course_id == course_id,
                Review.user_id == user_id,
            )
        )
        if duplicate_result.scalar_one_or_none() is not None:
            raise ConflictError(
                code="DUPLICATE_REVIEW",
                message="이미 이 코스에 리뷰를 작성하셨습니다",
            )

        review = Review(
            course_id=course_id,
            user_id=user_id,
            rating=rating,
            content=content,
        )
        db.add(review)
        await db.flush()

        # Re-query with joinedload; populate_existing forces refresh of
        # server-generated columns (created_at, updated_at) that SQLAlchemy
        # marks as expired after flush — avoiding MissingGreenlet in async.
        result = await db.execute(
            select(Review)
            .where(Review.id == review.id)
            .options(joinedload(Review.user))
            .execution_options(populate_existing=True)
        )
        return result.scalars().unique().one()

    async def get_course_reviews(
        self,
        db: AsyncSession,
        course_id: UUID,
        page: int = 0,
        per_page: int = 20,
    ) -> dict:
        """Get paginated reviews for a course with aggregate stats.

        Returns:
            dict with keys: data (list[Review]), total_count (int), avg_rating (float|None)
        """
        # Total count and average rating in a single query
        stats_result = await db.execute(
            select(
                func.count(Review.id),
                func.avg(Review.rating),
            ).where(Review.course_id == course_id)
        )
        row = stats_result.one()
        total_count = row[0] or 0
        avg_rating = round(float(row[1]), 1) if row[1] is not None else None

        # Paginated reviews with eager-loaded user
        reviews_result = await db.execute(
            select(Review)
            .where(Review.course_id == course_id)
            .options(joinedload(Review.user))
            .order_by(Review.created_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )
        reviews = reviews_result.scalars().unique().all()

        return {
            "data": list(reviews),
            "total_count": total_count,
            "avg_rating": avg_rating,
        }

    async def get_my_review(
        self,
        db: AsyncSession,
        course_id: UUID,
        user_id: UUID,
    ) -> Review | None:
        """Get the current user's review on a specific course."""
        result = await db.execute(
            select(Review)
            .where(
                Review.course_id == course_id,
                Review.user_id == user_id,
            )
            .options(joinedload(Review.user))
        )
        return result.scalars().unique().one_or_none()

    async def update_review(
        self,
        db: AsyncSession,
        review_id: UUID,
        user_id: UUID,
        rating: int | None = None,
        content: str | None = None,
    ) -> Review:
        """Update an existing review. Only the author can update.

        Raises:
            NotFoundError: Review does not exist.
            PermissionDeniedError: User is not the review author.
        """
        result = await db.execute(
            select(Review)
            .where(Review.id == review_id)
            .options(joinedload(Review.user))
        )
        review = result.scalars().unique().one_or_none()

        if review is None:
            raise NotFoundError(code="NOT_FOUND", message="리뷰를 찾을 수 없습니다")

        if review.user_id != user_id:
            raise PermissionDeniedError(
                code="FORBIDDEN", message="본인의 리뷰만 수정할 수 있습니다"
            )

        if rating is not None:
            review.rating = rating
        if content is not None:
            review.content = content

        await db.flush()

        # Re-query with joinedload; populate_existing forces refresh of
        # expired attributes (updated_at onupdate) from the identity map.
        result = await db.execute(
            select(Review)
            .where(Review.id == review.id)
            .options(joinedload(Review.user))
            .execution_options(populate_existing=True)
        )
        return result.scalars().unique().one()

    async def reply_to_review(
        self,
        db: AsyncSession,
        course_id: UUID,
        review_id: UUID,
        creator_id: UUID,
        content: str,
    ) -> Review:
        """Add a creator reply to a review.

        Only the course creator can reply.

        Raises:
            NotFoundError: Course or review does not exist.
            PermissionDeniedError: User is not the course creator.
        """
        # Verify the course exists and user is the creator
        course_result = await db.execute(
            select(Course).where(Course.id == course_id)
        )
        course = course_result.scalar_one_or_none()
        if course is None:
            raise NotFoundError(code="NOT_FOUND", message="코스를 찾을 수 없습니다")
        if course.creator_id != creator_id:
            raise PermissionDeniedError(
                code="FORBIDDEN", message="코스 제작자만 답글을 달 수 있습니다"
            )

        # Get the review
        result = await db.execute(
            select(Review).where(Review.id == review_id, Review.course_id == course_id)
        )
        review = result.scalar_one_or_none()
        if review is None:
            raise NotFoundError(code="NOT_FOUND", message="리뷰를 찾을 수 없습니다")

        from datetime import datetime, timezone

        review.creator_reply = content
        review.creator_reply_at = datetime.now(timezone.utc)
        await db.flush()

        # Re-query with joinedload
        result = await db.execute(
            select(Review)
            .where(Review.id == review.id)
            .options(joinedload(Review.user))
            .execution_options(populate_existing=True)
        )
        return result.scalars().unique().one()

    async def delete_review(
        self,
        db: AsyncSession,
        review_id: UUID,
        user_id: UUID,
    ) -> None:
        """Delete a review. Only the author can delete.

        Raises:
            NotFoundError: Review does not exist.
            PermissionDeniedError: User is not the review author.
        """
        result = await db.execute(
            select(Review).where(Review.id == review_id)
        )
        review = result.scalar_one_or_none()

        if review is None:
            raise NotFoundError(code="NOT_FOUND", message="리뷰를 찾을 수 없습니다")

        if review.user_id != user_id:
            raise PermissionDeniedError(
                code="FORBIDDEN", message="본인의 리뷰만 삭제할 수 있습니다"
            )

        await db.delete(review)
        await db.flush()
