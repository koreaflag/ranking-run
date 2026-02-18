"""Follow service: manage user follow relationships and friend activity."""

from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.course import Course
from app.models.follow import Follow
from app.models.run_record import RunRecord
from app.models.run_session import RunSession
from app.models.user import User


class FollowService:
    """Handles follow/unfollow operations, follower lists, and friend activity."""

    async def follow_user(
        self,
        db: AsyncSession,
        follower_id: UUID,
        following_id: UUID,
    ) -> Follow:
        """Create a follow relationship.

        Raises:
            ValidationError: Attempting to follow yourself.
            NotFoundError: Target user does not exist.
            ConflictError: Already following this user.
        """
        if follower_id == following_id:
            raise ValidationError(
                code="SELF_FOLLOW", message="자기 자신을 팔로우할 수 없습니다"
            )

        # Verify target user exists
        target = await db.execute(
            select(User.id).where(User.id == following_id)
        )
        if target.scalar_one_or_none() is None:
            raise NotFoundError(
                code="NOT_FOUND", message="사용자를 찾을 수 없습니다"
            )

        # Check for existing follow
        existing = await db.execute(
            select(Follow.id).where(
                Follow.follower_id == follower_id,
                Follow.following_id == following_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise ConflictError(
                code="ALREADY_FOLLOWING", message="이미 팔로우하고 있습니다"
            )

        follow = Follow(follower_id=follower_id, following_id=following_id)
        db.add(follow)
        await db.flush()

        # Eager-load user relationships for the response
        await db.refresh(follow, attribute_names=["follower", "following"])
        return follow

    async def unfollow_user(
        self,
        db: AsyncSession,
        follower_id: UUID,
        following_id: UUID,
    ) -> None:
        """Remove a follow relationship.

        Raises:
            NotFoundError: Follow relationship does not exist.
        """
        result = await db.execute(
            select(Follow).where(
                Follow.follower_id == follower_id,
                Follow.following_id == following_id,
            )
        )
        follow = result.scalar_one_or_none()

        if follow is None:
            raise NotFoundError(
                code="NOT_FOUND", message="팔로우 관계를 찾을 수 없습니다"
            )

        await db.delete(follow)
        await db.flush()

    async def get_followers(
        self,
        db: AsyncSession,
        user_id: UUID,
        page: int = 0,
        per_page: int = 20,
    ) -> tuple[list[Follow], int]:
        """Get paginated list of a user's followers.

        Returns:
            Tuple of (follow list, total count).
        """
        # Total count
        count_result = await db.execute(
            select(func.count(Follow.id)).where(Follow.following_id == user_id)
        )
        total_count = count_result.scalar_one()

        # Paginated list with eager-loaded follower user
        result = await db.execute(
            select(Follow)
            .where(Follow.following_id == user_id)
            .options(joinedload(Follow.follower))
            .order_by(Follow.created_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )
        follows = result.scalars().unique().all()

        return list(follows), total_count

    async def get_following(
        self,
        db: AsyncSession,
        user_id: UUID,
        page: int = 0,
        per_page: int = 20,
    ) -> tuple[list[Follow], int]:
        """Get paginated list of users that a user is following.

        Returns:
            Tuple of (follow list, total count).
        """
        count_result = await db.execute(
            select(func.count(Follow.id)).where(Follow.follower_id == user_id)
        )
        total_count = count_result.scalar_one()

        result = await db.execute(
            select(Follow)
            .where(Follow.follower_id == user_id)
            .options(joinedload(Follow.following))
            .order_by(Follow.created_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )
        follows = result.scalars().unique().all()

        return list(follows), total_count

    async def get_follow_status(
        self,
        db: AsyncSession,
        current_user_id: UUID,
        target_user_id: UUID,
    ) -> dict:
        """Get follow status between the current user and a target user.

        Returns:
            dict with is_following, followers_count, following_count.
        """
        # Check if current user follows the target
        is_following_result = await db.execute(
            select(Follow.id).where(
                Follow.follower_id == current_user_id,
                Follow.following_id == target_user_id,
            )
        )
        is_following = is_following_result.scalar_one_or_none() is not None

        # Target user's follower count
        followers_result = await db.execute(
            select(func.count(Follow.id)).where(
                Follow.following_id == target_user_id
            )
        )
        followers_count = followers_result.scalar_one()

        # Target user's following count
        following_result = await db.execute(
            select(func.count(Follow.id)).where(
                Follow.follower_id == target_user_id
            )
        )
        following_count = following_result.scalar_one()

        return {
            "is_following": is_following,
            "followers_count": followers_count,
            "following_count": following_count,
        }

    async def get_following_active_sessions(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> list[dict]:
        """Get friends who are currently running (active sessions).

        Returns a list of dicts with user info and session details for
        all users that the given user follows and who have an active run session.
        """
        # Subquery: IDs of users that the current user follows
        following_ids = (
            select(Follow.following_id)
            .where(Follow.follower_id == user_id)
            .scalar_subquery()
        )

        result = await db.execute(
            select(RunSession)
            .where(
                and_(
                    RunSession.user_id.in_(following_ids),
                    RunSession.status == "active",
                )
            )
            .options(joinedload(RunSession.user))
            .order_by(RunSession.started_at.desc())
        )
        sessions = result.scalars().unique().all()

        return [
            {
                "user_id": str(s.user_id),
                "nickname": s.user.nickname,
                "avatar_url": s.user.avatar_url,
                "session_id": str(s.id),
                "started_at": s.started_at,
                "course_id": str(s.course_id) if s.course_id else None,
            }
            for s in sessions
        ]

    async def get_activity_feed(
        self,
        db: AsyncSession,
        user_id: UUID,
        limit: int = 20,
    ) -> list[dict]:
        """Get recent activity from followed users.

        Combines recent completed runs and newly created courses
        from users that the current user follows, sorted by time.
        """
        from datetime import datetime, timedelta, timezone

        # Subquery: IDs of users the current user follows
        following_ids_q = (
            select(Follow.following_id)
            .where(Follow.follower_id == user_id)
        )

        cutoff = datetime.now(timezone.utc) - timedelta(days=7)

        # Recent runs from followed users (last 7 days)
        runs_result = await db.execute(
            select(RunRecord)
            .where(
                RunRecord.user_id.in_(following_ids_q),
                RunRecord.finished_at >= cutoff,
            )
            .options(
                joinedload(RunRecord.user),
                joinedload(RunRecord.course),
            )
            .order_by(RunRecord.finished_at.desc())
            .limit(limit)
        )
        runs = runs_result.scalars().unique().all()

        # Recent courses from followed users (last 7 days, public only)
        courses_result = await db.execute(
            select(Course)
            .where(
                Course.creator_id.in_(following_ids_q),
                Course.created_at >= cutoff,
                Course.is_public == True,  # noqa: E712
            )
            .options(joinedload(Course.creator))
            .order_by(Course.created_at.desc())
            .limit(limit)
        )
        courses = courses_result.scalars().unique().all()

        # Merge into a unified list
        items: list[dict] = []
        for run in runs:
            items.append({
                "type": "run_completed",
                "user_id": str(run.user_id),
                "nickname": run.user.nickname if run.user else None,
                "avatar_url": run.user.avatar_url if run.user else None,
                "run_id": str(run.id),
                "distance_meters": run.distance_meters,
                "duration_seconds": run.duration_seconds,
                "course_title": run.course.title if run.course else None,
                "created_at": run.finished_at,
            })

        for course in courses:
            items.append({
                "type": "course_created",
                "user_id": str(course.creator_id),
                "nickname": course.creator.nickname if course.creator else None,
                "avatar_url": course.creator.avatar_url if course.creator else None,
                "course_id": str(course.id),
                "course_title_created": course.title,
                "course_distance_meters": course.distance_meters,
                "created_at": course.created_at,
            })

        # Sort by created_at descending and apply limit
        items.sort(key=lambda x: x["created_at"], reverse=True)
        return items[:limit]
